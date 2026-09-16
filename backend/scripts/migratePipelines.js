/**
 * migratePipelines.js
 *
 * One-time migration script for the flexible Pipeline system.
 *
 * WHAT IT DOES:
 *   1. Reads all unmapped leads (pipelineId: null) for each tenant.
 *   2. Classifies each lead into a pipeline type (sales / recruitment / internship)
 *      by inspecting ACTUAL lead data: adName, metaFormName, sheetName, campaignName,
 *      serviceRequired, customFields — NOT by workspace industry alone.
 *   3. Creates the needed pipelines (using industry templates) if they don't exist yet.
 *   4. Assigns each lead to the correct pipeline + stage.
 *
 * CLASSIFICATION SIGNALS (inspected on every lead):
 *   adName, metaFormName, sheetName, campaignName, serviceRequired, customFields
 *
 *   internship_keywords → Internship Pipeline (internship_training template)
 *   hiring_keywords     → Recruitment Pipeline (recruitment_hr template)
 *   default             → Sales Pipeline (digital_marketing template, or tenant industry)
 *
 * STATUS → STAGE MAPPING:
 *   Sales pipeline       : new_lead → New Lead, contacted → Contacted, etc.
 *   Recruitment pipeline : all statuses → first open stage (New Applicant)
 *   Internship pipeline  : all statuses → first open stage (New Applicant)
 *   won / lost           : → first stage of matching type in any pipeline
 *
 * SAFETY:
 *   - Only updates leads that do NOT have a pipelineId set.
 *   - Never deletes any lead.
 *   - Never changes: status, name, phone, email, notes, tags, customFields, ad attribution.
 *   - Idempotent — safe to run multiple times.
 *
 * DRY RUN (no DB writes — fully simulated from templates):
 *   $env:DRY_RUN="true"; node scripts/migratePipelines.js       (PowerShell)
 *   DRY_RUN=true node scripts/migratePipelines.js               (bash)
 *
 * LIVE RUN (writes to MongoDB):
 *   node scripts/migratePipelines.js
 *
 * SPECIFIC TENANT ONLY:
 *   $env:TENANT_ID="<mongoId>"; node scripts/migratePipelines.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Lead     = require('../models/Lead');
const Pipeline = require('../models/Pipeline');
const Tenant   = require('../models/Tenant');
const { getTemplate, createDefaultPipelinesForTenant } = require('../utils/industryTemplates');

const DRY_RUN    = process.env.DRY_RUN === 'true';
const TARGET_TID = process.env.TENANT_ID || null;

// ─────────────────────────────────────────────────────────────────────────────
// Classification keywords
// ─────────────────────────────────────────────────────────────────────────────
const INTERNSHIP_RE = /\b(intern(ship)?|trainee|traini?ng|apprentice)\b/i;
const HIRING_RE     = /\b(hir(e|ing|ed)|job|career|vacanc(y|ies)|recruit(ment)?|appl(y|ication|icant)|staff(ing)?|position|employment|hr\b|resume|cv\b|walk.?in)\b/i;

/**
 * Classify a lead into 'sales' | 'recruitment' | 'internship'
 * purely from its own data fields.
 */
function classifyLead(lead) {
  const text = [
    lead.adName,
    lead.metaFormName,
    lead.sheetName,
    lead.campaignName,
    lead.serviceRequired,
    lead.source,
    typeof lead.customFields === 'object' && lead.customFields !== null
      ? JSON.stringify(lead.customFields)
      : '',
  ].filter(Boolean).join(' ');

  if (INTERNSHIP_RE.test(text)) return { type: 'internship', matchedIn: text.match(INTERNSHIP_RE)?.[0] };
  if (HIRING_RE.test(text))     return { type: 'recruitment', matchedIn: text.match(HIRING_RE)?.[0] };
  return { type: 'sales', matchedIn: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline type → template mapping
// ─────────────────────────────────────────────────────────────────────────────
// 'sales' template key falls back to tenant industry or 'digital_marketing'
const FIXED_TEMPLATE_MAP = {
  recruitment: 'recruitment_hr',
  internship:  'internship_training',
};

function getTemplateKeyForType(type, tenantIndustryKey) {
  if (FIXED_TEMPLATE_MAP[type]) return FIXED_TEMPLATE_MAP[type];
  // sales: prefer tenant industry, fall back to digital_marketing
  return tenantIndustryKey || 'digital_marketing';
}

// ─────────────────────────────────────────────────────────────────────────────
// Build a virtual pipeline from a template (no DB write)
// Used in DRY_RUN to simulate what would be created.
// ─────────────────────────────────────────────────────────────────────────────
function buildVirtualPipeline(templateKey, overrideName) {
  const template = getTemplate(templateKey);
  if (!template || !template.pipelines || !template.pipelines.length) return null;

  const tpl = template.pipelines[0]; // use the first (default) pipeline in the template
  const stages = tpl.stages.map((stage, idx) => ({
    _id:         new mongoose.Types.ObjectId(),
    name:        stage.name,
    key:         stage.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    order:       idx,
    type:        stage.type || 'open',
    color:       stage.color || '#6366f1',
    probability: stage.probability || (stage.type === 'won' ? 100 : 0),
  }));

  return {
    _id:       new mongoose.Types.ObjectId(),
    name:      overrideName || tpl.name,
    key:       tpl.key,
    isDefault: tpl.isDefault || false,
    isActive:  true,
    stages,
    _virtual:  true, // marker: this does not exist in DB
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Map a lead's current status to a stage in the given pipeline
// ─────────────────────────────────────────────────────────────────────────────
const SALES_STATUS_TO_STAGE = {
  new_lead:       'New Lead',
  contacted:      'Contacted',
  qualified:      'Qualified',
  discovery_call: 'Discovery Call',
  proposal_sent:  'Proposal Sent',
  negotiation:    'Negotiation',
};

function findStageForLead(pipeline, lead, pipelineType) {
  const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order);

  // won/lost → match by stage type regardless of pipeline type
  if (lead.status === 'won')  return sorted.find(s => s.type === 'won')  || null;
  if (lead.status === 'lost') return sorted.find(s => s.type === 'lost') || null;

  // For sales pipelines: try to match by stage name via status mapping
  if (pipelineType === 'sales') {
    const targetName = SALES_STATUS_TO_STAGE[lead.status];
    if (targetName) {
      const byName = sorted.find(s =>
        s.name.toLowerCase().replace(/[\s_-]+/g, '') ===
        targetName.toLowerCase().replace(/[\s_-]+/g, '')
      );
      if (byName) return byName;
    }
  }

  // For recruitment / internship (or unmatched sales): use first open stage
  return sorted.find(s => s.type === 'open') || sorted[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalise tenant industry key to a template key
// ─────────────────────────────────────────────────────────────────────────────
function normaliseTenantIndustry(tenant) {
  const raw = tenant.company?.industry || tenant.industry || '';
  return raw.toLowerCase().replace(/[\s\/]+/g, '_').replace(/[^a-z0-9_]/g, '') || 'digital_marketing';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   Pipeline Migration Script                       ║`);
  console.log(`║   Mode : ${DRY_RUN ? '🔍 DRY RUN  (zero DB writes)       ' : '✍️  LIVE   (writes to MongoDB)         '}║`);
  if (TARGET_TID)
  console.log(`║   Tenant: ${TARGET_TID.slice(0, 24)}...           ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const tenantQuery = TARGET_TID ? { _id: TARGET_TID } : { status: { $ne: 'deleted' } };
  const tenants = await Tenant.find(tenantQuery).lean();
  console.log(`Found ${tenants.length} tenant(s) to process.\n`);

  let totalLeadsAssigned  = 0;
  let totalLeadsSkipped   = 0;
  let totalPipelinesNew   = 0;   // pipelines that would be / were created

  for (const tenant of tenants) {
    const tenantIndustryKey = normaliseTenantIndustry(tenant);
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Tenant : "${tenant.name}" (${tenant._id})`);
    console.log(`Industry key : ${tenantIndustryKey}`);
    console.log(`${'═'.repeat(60)}`);

    // ── Fetch unmapped leads ────────────────────────────────────────────────
    const unmappedLeads = await Lead.find({
      tenantId:   tenant._id,
      pipelineId: null,
      status: { $nin: ['archived', 'converted'] },
    })
      .populate('formId', 'name')
      .lean();

    if (unmappedLeads.length === 0) {
      console.log(`  ✓ No unmapped leads — nothing to do.\n`);
      continue;
    }
    console.log(`  Unmapped leads: ${unmappedLeads.length}\n`);

    // ── Classify every lead ─────────────────────────────────────────────────
    const buckets = { sales: [], recruitment: [], internship: [] };

    for (const lead of unmappedLeads) {
      const { type, matchedIn } = classifyLead(lead);
      buckets[type].push({ lead, matchedIn });
    }

    console.log(`  Classification summary:`);
    for (const [type, items] of Object.entries(buckets)) {
      if (items.length) console.log(`    ${type.padEnd(12)}: ${items.length} lead(s)`);
    }
    console.log('');

    // ── For each pipeline type that has leads, resolve a pipeline ───────────
    // Map: type → pipeline object (virtual in DRY_RUN, real in LIVE)
    const pipelineCache = {};

    for (const type of Object.keys(buckets)) {
      if (!buckets[type].length) continue;

      const tplKey      = getTemplateKeyForType(type, tenantIndustryKey);
      const tplDef      = getTemplate(tplKey);
      const pplName     = tplDef?.pipelines?.[0]?.name || (type === 'sales' ? 'Sales Pipeline' : type === 'recruitment' ? 'Recruitment Pipeline' : 'Internship Pipeline');

      // Try to find an existing pipeline with this name in DB
      let pipeline = await Pipeline.findOne({ tenantId: tenant._id, name: pplName, isActive: true }).lean();

      if (!pipeline) {
        if (DRY_RUN) {
          // Build a virtual in-memory pipeline — no DB write
          pipeline = buildVirtualPipeline(tplKey, pplName);
          if (pipeline) {
            console.log(`  [DRY RUN] Would CREATE "${pplName}" (template: ${tplKey}) — virtual for simulation`);
            totalPipelinesNew++;
          } else {
            console.log(`  ⚠️  [DRY RUN] Template "${tplKey}" not found — ${type} leads will be UNCLASSIFIED`);
          }
        } else {
          // LIVE: create from template
          const created = await createDefaultPipelinesForTenant(tenant._id, tplKey, null);
          totalPipelinesNew += created.length;
          pipeline = await Pipeline.findOne({ tenantId: tenant._id, name: pplName, isActive: true }).lean();
          if (!pipeline) {
            // Final fallback: any active pipeline matching the name prefix
            pipeline = await Pipeline.findOne({ tenantId: tenant._id, isActive: true }).lean();
          }
          if (pipeline) {
            console.log(`  ✅ Created / found pipeline "${pipeline.name}" (${pipeline._id})`);
          } else {
            console.log(`  ⚠️  Could not create pipeline for type "${type}" — those leads will be skipped`);
          }
        }
      } else {
        console.log(`  ✓ Existing pipeline "${pipeline.name}" (${pipeline._id}) will be used for ${type}`);
      }

      pipelineCache[type] = pipeline || null;
    }

    // ── Per-lead detail report ──────────────────────────────────────────────
    console.log(`\n  ${'─'.repeat(56)}`);
    console.log(`  LEAD-BY-LEAD CLASSIFICATION REPORT`);
    console.log(`  ${'─'.repeat(56)}`);

    const reportRows = [];  // for summary at the end

    for (const type of ['sales', 'recruitment', 'internship']) {
      const items = buckets[type];
      if (!items.length) continue;

      const pipeline = pipelineCache[type];

      console.log(`\n  ► ${type.toUpperCase()} PIPELINE${pipeline ? ` → "${pipeline.name}"` : ' → ⚠️ UNRESOLVED'}`);
      console.log(`  ${'·'.repeat(54)}`);
      console.log(`  ${'LeadID'.padEnd(14)} ${'Name'.padEnd(22)} ${'AdName / FormName / Sheet'.padEnd(32)} ${'Stage'}`);
      console.log(`  ${'─'.repeat(54)}`);

      for (const { lead, matchedIn } of items) {
        const stage = pipeline ? findStageForLead(pipeline, lead, type) : null;

        const leadId   = lead.leadId || String(lead._id).slice(-6);
        const name     = (lead.name || '—').slice(0, 21);
        const signal   = (lead.adName || lead.metaFormName || lead.sheetName || lead.campaignName || lead.source || '—').slice(0, 31);
        const stageLbl = stage ? `${stage.name} [${stage.type}]` : '⚠️  no stage found';
        const keyword  = matchedIn ? `  ← "${matchedIn}"` : '';

        console.log(`  ${leadId.padEnd(14)} ${name.padEnd(22)} ${signal.padEnd(32)} ${stageLbl}${keyword}`);

        reportRows.push({
          leadId,
          name:        lead.name,
          status:      lead.status,
          adName:      lead.adName      || null,
          formName:    lead.metaFormName || lead.formId?.name || null,
          sheetName:   lead.sheetName   || null,
          campaignName:lead.campaignName || null,
          type,
          pipeline:    pipeline?.name   || 'UNRESOLVED',
          stage:       stage?.name      || null,
          stageType:   stage?.type      || null,
          keyword:     matchedIn        || null,
        });

        if (!stage) {
          totalLeadsSkipped++;
        } else {
          if (!DRY_RUN) {
            // LIVE: write pipelineId, stageId, stageName, stageType only
            await Lead.findByIdAndUpdate(lead._id, {
              $set: {
                pipelineId: pipeline._id,
                stageId:    stage._id,
                stageName:  stage.name,
                stageType:  stage.type,
              },
            });
          }
          totalLeadsAssigned++;
        }
      }
    }

    // ── Per-tenant summary ──────────────────────────────────────────────────
    console.log(`\n  ${'─'.repeat(56)}`);
    console.log(`  TENANT SUMMARY`);
    for (const [type, items] of Object.entries(buckets)) {
      if (!items.length) continue;
      const pipeline = pipelineCache[type];
      const resolved = items.filter(({ lead }) => {
        const stage = pipeline ? findStageForLead(pipeline, lead, type) : null;
        return !!stage;
      });
      console.log(`  ${type.padEnd(14)}: ${resolved.length}/${items.length} leads → "${pipeline?.name || 'UNRESOLVED'}"`);
    }
  }

  // ── Global summary ──────────────────────────────────────────────────────────
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log(`  GLOBAL MIGRATION SUMMARY`);
  console.log(`  Mode              : ${DRY_RUN ? 'DRY RUN — ZERO changes written to DB' : 'LIVE — changes applied'}`);
  console.log(`  Pipelines         : ${totalPipelinesNew} would be created${DRY_RUN ? '' : ' / were created'}`);
  console.log(`  Leads to assign   : ${totalLeadsAssigned}`);
  console.log(`  Leads skipped     : ${totalLeadsSkipped} (no stage resolved)`);
  if (DRY_RUN) {
    console.log(`\n  ⚠️  Nothing was written. To apply:`);
    console.log(`     node scripts/migratePipelines.js`);
  }
  console.log(`${'═'.repeat(60)}\n`);

  await mongoose.disconnect();
  console.log('Disconnected.\n');
}

run().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
