/**
 * pipelineDefController.js
 *
 * CRUD for tenant Pipelines and their PipelineMappings (ad → pipeline routing).
 *
 * ALL operations are tenant-scoped via getTenantFilter / injectTenantId.
 * No cross-tenant access is possible through this controller.
 *
 * Routes (registered at /api/pipeline-defs):
 *
 *   GET    /                       — list pipelines for tenant
 *   POST   /                       — create pipeline
 *   GET    /:id                    — get single pipeline
 *   PUT    /:id                    — update pipeline (name, stages, etc.)
 *   DELETE /:id                    — deactivate/delete pipeline
 *   POST   /:id/default            — set as default pipeline
 *   GET    /:id/leads              — count leads per stage in pipeline
 *
 *   GET    /mappings               — list ad → pipeline mappings for tenant
 *   POST   /mappings               — create mapping
 *   PUT    /mappings/:mid          — update mapping
 *   DELETE /mappings/:mid          — delete mapping
 *
 *   GET    /industry-templates     — list available industry templates
 *   POST   /from-industry          — create default pipelines from industry template
 */

const mongoose = require('mongoose');
const Pipeline        = require('../models/Pipeline');
const PipelineMapping = require('../models/PipelineMapping');
const Lead            = require('../models/Lead');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');
const { listIndustries, createDefaultPipelinesForTenant } = require('../utils/industryTemplates');

// ── Error helper ──────────────────────────────────────────────────────────────
const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify that the current user owns the pipeline (same tenant).
 * Returns the pipeline doc or throws 404.
 */
async function ownedPipeline(id, req) {
  const tf = getTenantFilter(req);
  if (!tf.tenantId) throw err('No workspace context', 403);
  const pipeline = await Pipeline.findOne({ _id: id, ...tf });
  if (!pipeline) throw err('Pipeline not found', 404);
  return pipeline;
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/pipeline-defs
exports.listPipelines = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    if (!tf.tenantId) return next(err('No workspace context', 403));

    const pipelines = await Pipeline.find({ ...tf, isActive: true })
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();

    // Attach lead counts per pipeline
    const pipelineIds = pipelines.map(p => p._id);
    const counts = await Lead.aggregate([
      { $match: { tenantId: tf.tenantId, pipelineId: { $in: pipelineIds } } },
      { $group: { _id: '$pipelineId', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[String(c._id)] = c.count; });

    const result = pipelines.map(p => ({
      ...p,
      leadCount: countMap[String(p._id)] || 0,
    }));

    res.json({ success: true, data: result });
  } catch (e) { next(e); }
};

// GET /api/pipeline-defs/:id
exports.getPipeline = async (req, res, next) => {
  try {
    const pipeline = await ownedPipeline(req.params.id, req);

    // Attach per-stage lead counts
    const stageCounts = await Lead.aggregate([
      { $match: { tenantId: pipeline.tenantId, pipelineId: pipeline._id } },
      { $group: { _id: '$stageId', count: { $sum: 1 } } },
    ]);
    const stageCountMap = {};
    stageCounts.forEach(s => { stageCountMap[String(s._id)] = s.count; });

    const pObj = pipeline.toObject();
    pObj.stages = pObj.stages.map(s => ({
      ...s,
      leadCount: stageCountMap[String(s._id)] || 0,
    }));

    res.json({ success: true, data: pObj });
  } catch (e) { next(e); }
};

// POST /api/pipeline-defs
exports.createPipeline = async (req, res, next) => {
  try {
    const tenantId = injectTenantId(req);
    if (!tenantId) return next(err('No workspace context', 403));

    const { name, key, industry, description, stages = [], isDefault } = req.body;
    if (!name?.trim()) return next(err('Pipeline name is required'));

    // If setting as default, unset other defaults first
    if (isDefault) {
      await Pipeline.updateMany({ tenantId, isDefault: true }, { $set: { isDefault: false } });
    }

    // Normalise stages
    const normStages = (stages || []).map((s, i) => ({
      name:        String(s.name || '').trim(),
      key:         String(s.key || s.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      order:       i,
      type:        ['open', 'won', 'lost'].includes(s.type) ? s.type : 'open',
      color:       s.color || '#6366f1',
      probability: Number(s.probability ?? (s.type === 'won' ? 100 : 0)),
    })).filter(s => s.name);

    const pipeline = await Pipeline.create({
      tenantId,
      name:        name.trim(),
      key:         key?.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      industry:    industry || '',
      description: description || '',
      isDefault:   !!isDefault,
      isActive:    true,
      stages:      normStages,
      createdBy:   req.user._id,
    });

    res.status(201).json({ success: true, data: pipeline });
  } catch (e) {
    if (e.code === 11000) return next(err('A pipeline with this name already exists in your workspace'));
    next(e);
  }
};

// PUT /api/pipeline-defs/:id
exports.updatePipeline = async (req, res, next) => {
  try {
    const pipeline = await ownedPipeline(req.params.id, req);
    const { name, key, description, stages, isDefault, isActive } = req.body;

    if (name !== undefined) pipeline.name = name.trim();
    if (key !== undefined) pipeline.key = key.trim();
    if (description !== undefined) pipeline.description = description;
    if (isActive !== undefined) pipeline.isActive = !!isActive;

    // Handle default flag
    if (isDefault === true && !pipeline.isDefault) {
      await Pipeline.updateMany(
        { tenantId: pipeline.tenantId, isDefault: true },
        { $set: { isDefault: false } }
      );
      pipeline.isDefault = true;
    }

    // Update stages if provided
    if (Array.isArray(stages)) {
      pipeline.stages = stages.map((s, i) => {
        const stageDoc = {
          name:        String(s.name || '').trim(),
          key:         String(s.key || s.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          order:       typeof s.order === 'number' ? s.order : i,
          type:        ['open', 'won', 'lost'].includes(s.type) ? s.type : 'open',
          color:       s.color || '#6366f1',
          probability: Number(s.probability ?? (s.type === 'won' ? 100 : 0)),
        };
        // Preserve existing _id when updating existing stages
        if (s._id && mongoose.Types.ObjectId.isValid(s._id)) {
          stageDoc._id = new mongoose.Types.ObjectId(s._id);
        }
        return stageDoc;
      }).filter(s => s.name);
    }

    await pipeline.save();
    res.json({ success: true, data: pipeline });
  } catch (e) {
    if (e.code === 11000) return next(err('A pipeline with this name already exists in your workspace'));
    next(e);
  }
};

// DELETE /api/pipeline-defs/:id
exports.deletePipeline = async (req, res, next) => {
  try {
    const pipeline = await ownedPipeline(req.params.id, req);

    // Count leads still in this pipeline
    const leadCount = await Lead.countDocuments({
      tenantId: pipeline.tenantId,
      pipelineId: pipeline._id,
    });

    if (leadCount > 0) {
      const { force, moveTo } = req.body || {};
      if (!force) {
        return res.status(409).json({
          success: false,
          message: `This pipeline has ${leadCount} lead(s). Move them to another pipeline before deleting, or pass { "force": true, "moveTo": "<pipelineId>" } to move them automatically.`,
          leadCount,
          requiresMoveTo: true,
        });
      }

      // Move leads to another pipeline if specified
      if (moveTo) {
        const targetPipeline = await Pipeline.findOne({
          _id: moveTo,
          tenantId: pipeline.tenantId,
          isActive: true,
        });
        if (!targetPipeline) return next(err('Target pipeline not found or not in your workspace', 404));

        const firstStage = targetPipeline.firstOpenStage();
        await Lead.updateMany(
          { tenantId: pipeline.tenantId, pipelineId: pipeline._id },
          {
            $set: {
              pipelineId: targetPipeline._id,
              stageId:    firstStage?._id || null,
              stageName:  firstStage?.name || null,
              stageType:  firstStage?.type || 'open',
            },
          }
        );
      } else {
        // Clear pipeline assignment (leads become "unassigned")
        await Lead.updateMany(
          { tenantId: pipeline.tenantId, pipelineId: pipeline._id },
          { $set: { pipelineId: null, stageId: null, stageName: null, stageType: 'open' } }
        );
      }
    }

    // If this was the default pipeline, unset it
    if (pipeline.isDefault) {
      const nextPipeline = await Pipeline.findOne({
        tenantId: pipeline.tenantId,
        isActive: true,
        _id: { $ne: pipeline._id },
      }).sort({ createdAt: 1 });
      if (nextPipeline) {
        nextPipeline.isDefault = true;
        await nextPipeline.save();
      }
    }

    // Soft delete (deactivate) to preserve history
    pipeline.isActive = false;
    pipeline.isDefault = false;
    await pipeline.save();

    // Remove all mappings pointing to this pipeline
    await PipelineMapping.deleteMany({ tenantId: pipeline.tenantId, pipelineId: pipeline._id });

    res.json({ success: true, message: 'Pipeline deactivated', moved: leadCount });
  } catch (e) { next(e); }
};

// POST /api/pipeline-defs/:id/default
exports.setDefault = async (req, res, next) => {
  try {
    const pipeline = await ownedPipeline(req.params.id, req);

    await Pipeline.updateMany(
      { tenantId: pipeline.tenantId, isDefault: true },
      { $set: { isDefault: false } }
    );

    pipeline.isDefault = true;
    await pipeline.save();

    res.json({ success: true, data: pipeline, message: `"${pipeline.name}" is now the default pipeline` });
  } catch (e) { next(e); }
};

// GET /api/pipeline-defs/:id/leads — leads grouped by stage
exports.getPipelineLeads = async (req, res, next) => {
  try {
    const pipeline = await ownedPipeline(req.params.id, req);

    const leads = await Lead.aggregate([
      { $match: { tenantId: pipeline.tenantId, pipelineId: pipeline._id } },
      { $group: {
        _id:        '$stageId',
        stageName:  { $first: '$stageName' },
        stageType:  { $first: '$stageType' },
        count:      { $sum: 1 },
        totalValue: { $sum: '$value' },
      }},
    ]);

    const sorted = pipeline.sortedStages();
    const stageMap = {};
    leads.forEach(l => { stageMap[String(l._id)] = l; });

    const result = sorted.map(stage => ({
      stageId:    stage._id,
      stageName:  stage.name,
      stageType:  stage.type,
      stageColor: stage.color,
      count:      stageMap[String(stage._id)]?.count || 0,
      totalValue: stageMap[String(stage._id)]?.totalValue || 0,
    }));

    res.json({ success: true, pipeline: { _id: pipeline._id, name: pipeline.name }, data: result });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE MAPPING CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/pipeline-defs/mappings
exports.listMappings = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    if (!tf.tenantId) return next(err('No workspace context', 403));

    const mappings = await PipelineMapping.find({ ...tf })
      .populate('pipelineId', 'name isDefault')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: mappings });
  } catch (e) { next(e); }
};

// POST /api/pipeline-defs/mappings
exports.createMapping = async (req, res, next) => {
  try {
    const tenantId = injectTenantId(req);
    if (!tenantId) return next(err('No workspace context', 403));

    const { pipelineId, adId, adName, metaFormId, sheetName, source, stageId, label } = req.body;
    if (!pipelineId) return next(err('pipelineId is required'));

    // Verify the pipeline belongs to this tenant
    const pipeline = await Pipeline.findOne({ _id: pipelineId, tenantId, isActive: true });
    if (!pipeline) return next(err('Pipeline not found or not in your workspace', 404));

    // Validate stageId if provided
    if (stageId) {
      const stageExists = pipeline.stages.some(s => String(s._id) === String(stageId));
      if (!stageExists) return next(err('Stage not found in this pipeline'));
    }

    const mapping = await PipelineMapping.create({
      tenantId, pipelineId,
      adId:       adId       || null,
      adName:     adName     || null,
      metaFormId: metaFormId || null,
      sheetName:  sheetName  || null,
      source:     source     || null,
      stageId:    stageId    || null,
      label:      label      || '',
      isActive:   true,
      createdBy:  req.user._id,
    });

    res.status(201).json({ success: true, data: mapping });
  } catch (e) { next(e); }
};

// PUT /api/pipeline-defs/mappings/:mid
exports.updateMapping = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    if (!tf.tenantId) return next(err('No workspace context', 403));

    const mapping = await PipelineMapping.findOne({ _id: req.params.mid, ...tf });
    if (!mapping) return next(err('Mapping not found', 404));

    const allowed = ['pipelineId', 'adId', 'adName', 'metaFormId', 'sheetName', 'source', 'stageId', 'label', 'isActive'];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) mapping[k] = req.body[k];
    });

    // If pipelineId changed, verify new pipeline belongs to tenant
    if (req.body.pipelineId) {
      const pipeline = await Pipeline.findOne({ _id: req.body.pipelineId, tenantId: tf.tenantId });
      if (!pipeline) return next(err('Target pipeline not found in your workspace', 404));
    }

    await mapping.save();
    res.json({ success: true, data: mapping });
  } catch (e) { next(e); }
};

// DELETE /api/pipeline-defs/mappings/:mid
exports.deleteMapping = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    if (!tf.tenantId) return next(err('No workspace context', 403));

    const mapping = await PipelineMapping.findOneAndDelete({ _id: req.params.mid, ...tf });
    if (!mapping) return next(err('Mapping not found', 404));

    res.json({ success: true, message: 'Mapping deleted' });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// INDUSTRY TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/pipeline-defs/industry-templates
exports.listIndustryTemplates = async (req, res, next) => {
  try {
    res.json({ success: true, data: listIndustries() });
  } catch (e) { next(e); }
};

// POST /api/pipeline-defs/from-industry
// Body: { industry: 'recruitment_hr' }
exports.createFromIndustry = async (req, res, next) => {
  try {
    const tenantId = injectTenantId(req);
    if (!tenantId) return next(err('No workspace context', 403));

    const { industry } = req.body;
    if (!industry) return next(err('industry key is required'));

    const created = await createDefaultPipelinesForTenant(tenantId, industry, req.user._id);

    res.status(201).json({
      success: true,
      created: created.length,
      data: created,
      message: created.length > 0
        ? `Created ${created.length} pipeline(s) from "${industry}" template`
        : 'All pipelines from this template already exist',
    });
  } catch (e) { next(e); }
};

// ─────────────────────────────────────────────────────────────────────────────
// LEAD STAGE MOVEMENT (pipeline-aware)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /api/pipeline-defs/leads/:leadId/move
 * Move a lead to a stage within its own pipeline (or switch pipelines).
 *
 * Body: { stageId, pipelineId? }
 *
 * Security checks:
 *   - Lead must belong to same tenant
 *   - Stage must belong to the pipeline
 *   - Pipeline must belong to same tenant
 */
exports.moveLead = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    if (!tf.tenantId) return next(err('No workspace context', 403));

    const lead = await Lead.findOne({ _id: req.params.leadId, ...tf });
    if (!lead) return next(err('Lead not found', 404));

    const { stageId, pipelineId: targetPipelineId } = req.body;
    if (!stageId) return next(err('stageId is required'));

    // Determine target pipeline
    const pipelineId = targetPipelineId || lead.pipelineId;
    if (!pipelineId) return next(err('Lead has no pipeline assigned. Assign a pipeline first.'));

    const pipeline = await Pipeline.findOne({ _id: pipelineId, ...tf, isActive: true });
    if (!pipeline) return next(err('Target pipeline not found or not in your workspace', 404));

    // Validate stageId belongs to this pipeline
    const stage = pipeline.stages.find(s => String(s._id) === String(stageId));
    if (!stage) return next(err('Stage does not belong to the specified pipeline'));

    // Update lead
    lead.pipelineId = pipeline._id;
    lead.stageId    = stage._id;
    lead.stageName  = stage.name;
    lead.stageType  = stage.type;

    // Keep backward-compatible status field in sync for won/lost stages
    if (stage.type === 'won')  lead.status = 'won';
    if (stage.type === 'lost') lead.status = 'lost';
    if (stage.type === 'open' && ['won', 'lost'].includes(lead.status)) {
      lead.status = 'new_lead'; // reopen to safe default
    }

    await lead.save();
    res.json({ success: true, data: lead });
  } catch (e) { next(e); }
};
