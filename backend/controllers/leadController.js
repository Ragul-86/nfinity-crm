const Lead = require('../models/Lead');
const LeadActivity = require('../models/LeadActivity');
const FollowUp = require('../models/FollowUp');
const APIFeatures = require('../utils/apiFeatures');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');

const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

// ── Helper: log activity (fire-and-forget, never throws) ──────────────────────
async function logActivity(leadId, tenantId, type, description, userId, extra = {}) {
  try {
    await LeadActivity.create({
      lead: leadId,
      tenantId,
      type,
      description,
      performedBy: userId,
      ...extra,
    });
  } catch (_) {}
}

// ── GET /api/leads ─────────────────────────────────────────────────────────────
exports.getLeads = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);

    // Employees only see leads assigned to them
    if (req.user.role === 'employee') {
      tf.assignedTo = req.user.id;
    }

    // Pre-process special query values that APIFeatures cannot handle natively:
    // - externalSource=all_sheets  → { $in: ['google_sheet', 'google_sheets'] }
    // These are applied directly to tf so MongoDB gets the correct operator.
    const qs = { ...req.query };
    if (qs.externalSource === 'all_sheets') {
      tf.externalSource = { $in: ['google_sheet', 'google_sheets'] };
      delete qs.externalSource;
    }

    const baseQuery = Lead.find(tf)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email')
      .populate('campaign', 'name');

    const features = new APIFeatures(baseQuery, qs)
      .search(['name', 'email', 'company', 'phone', 'leadId'])
      .filter()
      .sort()
      .paginate();

    // Count with same search/filter applied (not raw tf) so pagination total is accurate
    const countFeatures = new APIFeatures(Lead.find(tf), qs)
      .search(['name', 'email', 'company', 'phone', 'leadId'])
      .filter();

    const [leads, total] = await Promise.all([
      features.query,
      Lead.countDocuments(countFeatures.query.getFilter()),
    ]);

    res.json({ success: true, count: leads.length, total, page: features.page, limit: features.limit, data: leads });
  } catch (e) { next(e); }
};

// ── GET /api/leads/:id ─────────────────────────────────────────────────────────
exports.getLead = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    if (req.user.role === 'employee') tf.assignedTo = req.user.id;

    const lead = await Lead.findOne({ _id: req.params.id, ...tf })
      .populate('assignedTo', 'name email avatar role')
      .populate('createdBy', 'name email')
      .populate('campaign', 'name type')
      .populate('convertedClientId', 'companyName contactPerson')
      .populate('formId', 'name');

    if (!lead) return next(err('Lead not found', 404));
    res.json({ success: true, data: lead });
  } catch (e) { next(e); }
};

// ── POST /api/leads ────────────────────────────────────────────────────────────
exports.createLead = async (req, res, next) => {
  try {
    const tenantId = injectTenantId(req);
    const lead = await Lead.create({
      ...req.body,
      createdBy: req.user.id,
      tenantId,
    });

    await logActivity(lead._id, tenantId, 'lead_created',
      `Lead created by ${req.user.name}`, req.user.id);

    await logAction({
      action: 'CREATE', module: 'leads',
      resourceId: lead._id, resourceType: 'Lead',
      details: { message: `Created lead: ${lead.name}`, leadId: lead.leadId },
      performedBy: req.user.id, tenantId,
    });

    const populated = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (e) { next(e); }
};

// ── PUT /api/leads/:id ─────────────────────────────────────────────────────────
exports.updateLead = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const old = await Lead.findOne({ _id: req.params.id, ...tf });
    if (!old) return next(err('Lead not found', 404));

    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email');

    const tenantId = old.tenantId;

    // Log meaningful changes as activities
    if (req.body.status && req.body.status !== old.status) {
      await logActivity(lead._id, tenantId, 'status_changed',
        `Status changed from ${old.status} to ${req.body.status}`,
        req.user.id, { oldValue: old.status, newValue: req.body.status });
    }
    if (req.body.priority && req.body.priority !== old.priority) {
      await logActivity(lead._id, tenantId, 'priority_changed',
        `Priority changed from ${old.priority} to ${req.body.priority}`,
        req.user.id, { oldValue: old.priority, newValue: req.body.priority });
    }
    if (req.body.value !== undefined && req.body.value !== old.value) {
      await logActivity(lead._id, tenantId, 'value_updated',
        `Deal value updated to ₹${req.body.value}`,
        req.user.id, { oldValue: String(old.value), newValue: String(req.body.value) });
    }

    res.json({ success: true, data: lead });
  } catch (e) { next(e); }
};

// ── DELETE /api/leads/:id ──────────────────────────────────────────────────────
exports.deleteLead = async (req, res, next) => {
  try {
    const lead = await Lead.findOneAndDelete({ _id: req.params.id, ...getTenantFilter(req) });
    if (!lead) return next(err('Lead not found', 404));

    // Clean up related data
    await Promise.all([
      FollowUp.deleteMany({ lead: lead._id }),
      LeadActivity.deleteMany({ lead: lead._id }),
    ]);

    await logAction({
      action: 'DELETE', module: 'leads',
      resourceId: lead._id, resourceType: 'Lead',
      details: { message: `Deleted lead: ${lead.name}` },
      performedBy: req.user.id, tenantId: lead.tenantId,
    });

    res.json({ success: true, message: 'Lead deleted' });
  } catch (e) { next(e); }
};

// ── POST /api/leads/:id/notes ──────────────────────────────────────────────────
exports.addNote = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, ...getTenantFilter(req) });
    if (!lead) return next(err('Lead not found', 404));
    if (!req.body.content) return next(err('Note content is required'));

    lead.notes.push({ content: req.body.content, createdBy: req.user.id });
    await lead.save();

    await logActivity(lead._id, lead.tenantId, 'note_added',
      `Note added by ${req.user.name}`, req.user.id);

    const populated = await Lead.findById(lead._id)
      .populate('notes.createdBy', 'name avatar')
      .populate('assignedTo', 'name email avatar');

    res.status(201).json({ success: true, data: populated });
  } catch (e) { next(e); }
};

// ── DELETE /api/leads/:id/notes/:noteId ───────────────────────────────────────
exports.deleteNote = async (req, res, next) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, ...getTenantFilter(req) });
    if (!lead) return next(err('Lead not found', 404));

    lead.notes = lead.notes.filter(n => String(n._id) !== req.params.noteId);
    await lead.save();

    await logActivity(lead._id, lead.tenantId, 'note_deleted',
      `Note deleted by ${req.user.name}`, req.user.id);

    res.json({ success: true, data: lead });
  } catch (e) { next(e); }
};

// ── GET /api/leads/stats ───────────────────────────────────────────────────────
// Supports optional stream filter query params:
//   metaFormId, sheetName, source, campaignId, externalSource
// When supplied, stats are scoped to that source stream.
// When absent, returns tenant-wide stats (existing behaviour unchanged).
exports.getLeadStats = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    if (req.user.role === 'employee') tf.assignedTo = req.user.id;

    // Optional stream-scoped filter — AND'd on top of tenantId
    const streamFilter = {};
    if (req.query.metaFormId)     streamFilter.metaFormId     = req.query.metaFormId;
    if (req.query.sheetName)      streamFilter.sheetName      = req.query.sheetName;
    if (req.query.spreadsheetId)  streamFilter.spreadsheetId  = req.query.spreadsheetId;
    if (req.query.source)         streamFilter.source         = req.query.source;
    if (req.query.campaignId)     streamFilter.campaignId     = req.query.campaignId;
    if (req.query.externalSource) {
      // 'all_sheets' is a frontend convenience value meaning both integrations
      if (req.query.externalSource === 'all_sheets') {
        streamFilter.externalSource = { $in: ['google_sheet', 'google_sheets'] };
      } else {
        streamFilter.externalSource = req.query.externalSource;
      }
    } else if (req.query.sheetName) {
      // When filtering by sheetName only, include leads from both sheet integrations
      streamFilter.externalSource = { $in: ['google_sheet', 'google_sheets'] };
    }

    const matchFilter = { ...tf, ...streamFilter };

    const [byStatus, bySource, byPriority, totalValue] = await Promise.all([
      Lead.aggregate([
        { $match: matchFilter },
        { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$value' } } },
      ]),
      Lead.aggregate([
        { $match: matchFilter },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: matchFilter },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: matchFilter },
        { $group: { _id: null, total: { $sum: '$value' }, count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        byStatus,
        bySource,
        byPriority,
        totals: totalValue[0] || { total: 0, count: 0 },
      },
    });
  } catch (e) { next(e); }
};

// ── GET /api/leads/pipeline-breakdown ─────────────────────────────────────────
// Aggregates filtered leads by pipelineId → stageId, joins Pipeline docs for
// stage names, order, and colors. Used by the GSheetLeadsDashboard.
// Accepts same stream filter params as getLeadStats:
//   sheetName, externalSource (incl. 'all_sheets'), metaFormId, source, campaignId
// ──────────────────────────────────────────────────────────────────────────────
exports.getPipelineBreakdown = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    if (req.user.role === 'employee') tf.assignedTo = req.user.id;

    const streamFilter = {};
    if (req.query.metaFormId)     streamFilter.metaFormId     = req.query.metaFormId;
    if (req.query.sheetName)      streamFilter.sheetName      = req.query.sheetName;
    if (req.query.source)         streamFilter.source         = req.query.source;
    if (req.query.campaignId)     streamFilter.campaignId     = req.query.campaignId;
    if (req.query.externalSource) {
      if (req.query.externalSource === 'all_sheets') {
        streamFilter.externalSource = { $in: ['google_sheet', 'google_sheets'] };
      } else {
        streamFilter.externalSource = req.query.externalSource;
      }
    } else if (req.query.sheetName) {
      streamFilter.externalSource = { $in: ['google_sheet', 'google_sheets'] };
    }

    const matchFilter = { ...tf, ...streamFilter };

    // Group by pipelineId → stageId
    const agg = await Lead.aggregate([
      { $match: { ...matchFilter, pipelineId: { $ne: null, $exists: true } } },
      {
        $group: {
          _id:      { pipelineId: '$pipelineId', stageId: '$stageId', stageName: '$stageName' },
          count:    { $sum: 1 },
        },
      },
      {
        $group: {
          _id:    '$_id.pipelineId',
          stages: {
            $push: {
              stageId:   '$_id.stageId',
              stageName: '$_id.stageName',
              count:     '$count',
            },
          },
          total: { $sum: '$count' },
        },
      },
      { $sort: { total: -1 } },
    ]);

    if (agg.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Fetch Pipeline docs to get name, stage order, color, type
    const Pipeline = require('../models/Pipeline');
    const pipelineIds = agg.map(a => a._id).filter(Boolean);
    const pipelines   = await Pipeline.find({ _id: { $in: pipelineIds }, ...tf }).lean();
    const pipelineMap = {};
    for (const p of pipelines) pipelineMap[p._id.toString()] = p;

    const result = agg.map(({ _id: pipelineId, stages, total }) => {
      const pipeline      = pipelineMap[pipelineId?.toString()] || {};
      const pipelineStages = pipeline.stages || [];

      // Build stageId → meta map from Pipeline doc
      const stageMeta = {};
      for (const s of pipelineStages) {
        stageMeta[s._id.toString()] = s;
      }

      // Enrich each stage with Pipeline-doc data, sort by order
      const enrichedStages = stages.map(s => {
        const meta = stageMeta[s.stageId?.toString()] || {};
        return {
          stageId:   s.stageId,
          stageName: s.stageName || meta.name || 'Unknown Stage',
          count:     s.count,
          order:     meta.order  ?? 0,
          color:     meta.color  || '#6366f1',
          type:      meta.type   || 'open',
        };
      }).sort((a, b) => a.order - b.order);

      return {
        pipelineId,
        pipelineName: pipeline.name || 'Unnamed Pipeline',
        stages:       enrichedStages,
        total,
      };
    });

    res.json({ success: true, data: result });
  } catch (e) { next(e); }
};

// ── GET /api/leads/:id/timeline ───────────────────────────────────────────────
exports.getTimeline = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const lead = await Lead.findOne({ _id: req.params.id, ...tf });
    if (!lead) return next(err('Lead not found', 404));

    const [activities, followUps] = await Promise.all([
      LeadActivity.find({ lead: lead._id })
        .populate('performedBy', 'name avatar')
        .sort({ createdAt: -1 })
        .limit(100),
      FollowUp.find({ lead: lead._id })
        .populate('assignedTo', 'name avatar')
        .populate('createdBy', 'name avatar')
        .sort({ scheduledAt: -1 }),
    ]);

    res.json({ success: true, data: { activities, followUps } });
  } catch (e) { next(e); }
};

// ── POST /api/leads/bulk ───────────────────────────────────────────────────────
exports.bulkAction = async (req, res, next) => {
  try {
    const { action, ids, value } = req.body;
    if (!action || !ids?.length) return next(err('action and ids are required'));

    const tf = getTenantFilter(req);
    const filter = { _id: { $in: ids }, ...tf };

    let result;
    switch (action) {
      case 'delete':
        if (!['super_admin', 'admin', 'manager'].includes(req.user.role)) {
          return next(err('Not authorized to bulk delete', 403));
        }
        result = await Lead.deleteMany(filter);
        await Promise.all([
          FollowUp.deleteMany({ lead: { $in: ids } }),
          LeadActivity.deleteMany({ lead: { $in: ids } }),
        ]);
        break;

      case 'status':
        if (!value) return next(err('value is required for status action'));
        result = await Lead.updateMany(filter, { $set: { status: value } });
        break;

      case 'priority':
        if (!value) return next(err('value is required for priority action'));
        result = await Lead.updateMany(filter, { $set: { priority: value } });
        break;

      case 'assign':
        if (!value) return next(err('value is required for assign action'));
        result = await Lead.updateMany(filter, { $addToSet: { assignedTo: value } });
        break;

      case 'unassign':
        result = await Lead.updateMany(filter, { $set: { assignedTo: [] } });
        break;

      case 'tag':
        if (!value) return next(err('value is required for tag action'));
        result = await Lead.updateMany(filter, { $addToSet: { tags: value } });
        break;

      case 'archive':
        result = await Lead.updateMany(filter, { $set: { status: 'archived' } });
        break;

      default:
        return next(err(`Unknown bulk action: ${action}`));
    }

    await logAction({
      action: 'BULK_UPDATE', module: 'leads',
      details: { message: `Bulk ${action} on ${ids.length} lead(s)`, action, count: ids.length },
      performedBy: req.user.id, tenantId: injectTenantId(req),
    });

    res.json({ success: true, affected: result?.deletedCount || result?.modifiedCount || ids.length });
  } catch (e) { next(e); }
};

// ── POST /api/leads/import ─────────────────────────────────────────────────────
// Accepts JSON array of lead objects parsed from CSV/Excel by frontend
exports.importLeads = async (req, res, next) => {
  try {
    const { leads: rows } = req.body;
    if (!Array.isArray(rows) || !rows.length) return next(err('No lead data provided'));
    if (rows.length > 500) return next(err('Max 500 leads per import'));

    const tenantId = injectTenantId(req);
    const created = [];
    const skipped = [];

    for (const row of rows) {
      if (!row.name) { skipped.push({ row, reason: 'Missing name' }); continue; }
      try {
        const lead = await Lead.create({
          ...row,
          source: row.source || 'import',
          createdBy: req.user.id,
          tenantId,
        });
        await logActivity(lead._id, tenantId, 'imported',
          `Lead imported by ${req.user.name}`, req.user.id);
        created.push(lead._id);
      } catch (e) {
        skipped.push({ row, reason: e.message });
      }
    }

    await logAction({
      action: 'IMPORT', module: 'leads',
      details: { message: `Imported ${created.length} leads, skipped ${skipped.length}`, imported: created.length, skipped: skipped.length },
      performedBy: req.user.id, tenantId,
    });

    res.json({ success: true, imported: created.length, skipped: skipped.length, errors: skipped });
  } catch (e) { next(e); }
};

// ── GET /api/leads/export ──────────────────────────────────────────────────────
// ── GET /api/leads/ads ─────────────────────────────────────────────────────────
// Returns distinct ads (adId + adName) for the tenant, with lead count per ad.
// Used by the Leads page ad-filter dropdown.
exports.getAdSummary = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);

    const ads = await Lead.aggregate([
      { $match: { ...tf, adId: { $ne: null } } },
      {
        $group: {
          _id:    '$adId',
          adName: { $first: '$adName' },
          count:  { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 200 },
    ]);

    res.json({ success: true, ads });
  } catch (e) { next(e); }
};

exports.exportLeads = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    if (req.user.role === 'employee') tf.assignedTo = req.user.id;

    const leads = await Lead.find(tf)
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(5000);

    const rows = leads.map(l => [
      l.leadId || '',
      l.name,
      l.company,
      l.phone,
      l.email,
      l.status,
      l.priority,
      l.source,
      l.value || 0,
      l.assignedTo?.map(u => u.name).join('; '),
      l.tags?.join(', '),
      l.city, l.state, l.country,
      l.expectedCloseDate?.toISOString().split('T')[0] || '',
      l.createdAt?.toISOString().split('T')[0] || '',
    ]);

    const header = ['Lead ID','Name','Company','Phone','Email','Status','Priority','Source',
      'Value','Assigned To','Tags','City','State','Country','Expected Close','Created At'];

    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(csv);
  } catch (e) { next(e); }
};
