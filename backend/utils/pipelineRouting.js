/**
 * pipelineRouting.js
 *
 * Single source of truth for choosing the pipeline + starting stage of a lead
 * arriving through any Google Sheets ingestion path:
 *   - controllers/integrationController.js   (native OAuth sync)
 *   - controllers/internalSyncController.js  (scheduled / Drive-watch sync)
 *   - controllers/gsheetWebhookController.js (Apps Script webhook)
 *
 * Priority (first hit wins):
 *   1. Explicit PipelineMapping (adId > metaFormId > spreadsheetId+sheetName > sheetName > source)
 *   2. Saved per-sheet pipelineId (config.spreadsheets[].pipelineId)
 *   3. Keyword classification (utils/leadClassifier.js) → an EXISTING active pipeline of that type
 *   4. Tenant default pipeline (isDefault, active)
 *   5. Oldest active pipeline
 *   6. null — no valid pipeline
 *
 * Every candidate must belong to the lead's tenant and be active.
 * This module only READS pipelines. It never creates or modifies a pipeline,
 * and never changes which pipeline is the tenant default.
 */

const Pipeline        = require('../models/Pipeline');
const PipelineMapping = require('../models/PipelineMapping');
const { classifyLead } = require('./leadClassifier');

const NO_PIPELINE = Object.freeze({ pipelineId: null, stageId: null, stageName: null, stageType: 'open' });

// Pipelines that represent hiring / training flows.
const HIRING_INDUSTRIES = new Set(['recruitment_hr', 'internship_training', 'recruitment_agency']);
const HIRING_KEYS       = new Set(['recruitment', 'internship', 'agency_recruitment']);

// A Sales pipeline is identified by its key: "sales", "b2b_sales", "saas_sales", …
const SALES_KEY_RE = /(^|_)sales$/;

const sameTenant = (pipeline, tenantId) =>
  !!pipeline && String(pipeline.tenantId) === String(tenantId);

const usable = (pipeline, tenantId) =>
  sameTenant(pipeline, tenantId) && pipeline.isActive === true;

function matchesType(pipeline, type) {
  if (type === 'recruitment') return pipeline.industry === 'recruitment_hr'      || pipeline.key === 'recruitment';
  if (type === 'internship')  return pipeline.industry === 'internship_training' || pipeline.key === 'internship';
  // sales: only a pipeline with a Sales key, or the tenant's explicitly flagged
  // default when that default is not a hiring/training pipeline. Unrelated
  // pipelines (Project, Operations, …) are never treated as Sales.
  if (SALES_KEY_RE.test(pipeline.key || '')) return true;
  return pipeline.isDefault === true
      && !HIRING_INDUSTRIES.has(pipeline.industry)
      && !HIRING_KEYS.has(pipeline.key);
}

// Pick the best candidate of a type from the tenant's active pipelines.
function pickByType(pipelines, type) {
  const candidates = pipelines.filter(p => matchesType(p, type));
  if (!candidates.length) return null;
  return candidates.find(p => p.isDefault)
      || candidates.find(p => p.key === 'sales')
      || candidates[0];   // list is sorted oldest-first
}

function startStage(pipeline, stageOverrideId) {
  const sorted = [...(pipeline.stages || [])].sort((a, b) => a.order - b.order);
  let stage = stageOverrideId ? sorted.find(s => String(s._id) === String(stageOverrideId)) : null;
  if (!stage) stage = sorted.find(s => s.type === 'open') || sorted[0] || null;
  return stage;
}

function assignment(pipeline, stageOverrideId) {
  const stage = startStage(pipeline, stageOverrideId);
  return {
    pipelineId: pipeline._id,
    stageId:    stage?._id  || null,
    stageName:  stage?.name || null,
    stageType:  stage?.type || 'open',
  };
}

/**
 * @param {string|ObjectId} tenantId
 * @param {object} lead
 *   adId, metaFormId, spreadsheetId, sheetName, source        — mapping keys
 *   adName, metaFormName, campaignName                         — classification text
 *   savedPipelineId                                            — config.spreadsheets[].pipelineId
 * @returns {Promise<{pipelineId, stageId, stageName, stageType}>}
 */
async function resolveLeadPipeline(tenantId, lead = {}) {
  try {
    const { adId, metaFormId, spreadsheetId, sheetName, source, savedPipelineId } = lead;

    // 1. Explicit PipelineMapping — strict priority, stop at first valid hit
    const tiers = [
      adId                         ? { adId }                       : null,
      metaFormId                   ? { metaFormId }                 : null,
      (spreadsheetId && sheetName) ? { spreadsheetId, sheetName }   : null,
      sheetName                    ? { sheetName }                  : null,
      source                       ? { source }                     : null,
    ].filter(Boolean);

    for (const criterion of tiers) {
      const mapping = await PipelineMapping.findOne({
        tenantId, isActive: true, ...criterion,
      }).populate('pipelineId').lean();
      if (mapping && usable(mapping.pipelineId, tenantId)) {
        return assignment(mapping.pipelineId, mapping.stageId);
      }
    }

    // 2. Saved per-sheet pipelineId (must be this tenant's and active)
    if (savedPipelineId) {
      let saved = null;
      try {
        saved = await Pipeline.findOne({ _id: savedPipelineId, tenantId, isActive: true }).lean();
      } catch { saved = null; }   // malformed id → ignore, continue down the chain
      if (usable(saved, tenantId)) return assignment(saved);
    }

    // 3. Keyword classification → existing active pipeline of that type
    const active = (await Pipeline.find({ tenantId, isActive: true }).sort({ createdAt: 1 }).lean())
      .filter(p => usable(p, tenantId));

    const { type } = classifyLead({
      adName:       lead.adName,
      metaFormName: lead.metaFormName,
      sheetName,
      campaignName: lead.campaignName,
    });
    const classified = pickByType(active, type);
    if (classified) return assignment(classified);

    // 4. Tenant default, 5. any active pipeline (oldest first)
    const fallback = active.find(p => p.isDefault) || active[0];
    if (fallback) return assignment(fallback);

    // 6. Nothing valid
    return { ...NO_PIPELINE };
  } catch (e) {
    console.error('Pipeline routing failed:', e.message);
    return { ...NO_PIPELINE };
  }
}

module.exports = { resolveLeadPipeline, pickByType, matchesType };
