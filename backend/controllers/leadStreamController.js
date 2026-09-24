const mongoose = require('mongoose');
const Lead      = require('../models/Lead');
const LeadStream = require('../models/LeadStream');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');

const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a MongoDB filter from a LeadStream's stored filter criteria.
 * Always requires a tenantId from the authenticated request — never from body.
 */
function buildLeadFilter(tf, streamFilter = {}) {
  const filter = { ...tf };

  if (streamFilter.metaFormId)   filter.metaFormId   = streamFilter.metaFormId;
  if (streamFilter.sheetName)    filter.sheetName    = streamFilter.sheetName;
  if (streamFilter.spreadsheetId) filter.spreadsheetId = streamFilter.spreadsheetId;
  if (streamFilter.source)       filter.source       = streamFilter.source;
  if (streamFilter.campaignId)   filter.campaignId   = streamFilter.campaignId;

  // sheet_tab streams cover BOTH externalSource values (google_sheet + google_sheets)
  // unless a specific externalSource is explicitly requested
  if (streamFilter.externalSource) {
    filter.externalSource = streamFilter.externalSource;
  } else if (streamFilter.sheetName) {
    // When filtering by sheetName only, include leads from both integrations
    filter.externalSource = { $in: ['google_sheet', 'google_sheets'] };
  }

  return filter;
}

/**
 * Count leads by status within a given filter.
 */
async function getStreamCounts(matchFilter) {
  const [byStatus, totals] = await Promise.all([
    Lead.aggregate([
      { $match: matchFilter },
      { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$value' } } },
    ]),
    Lead.aggregate([
      { $match: matchFilter },
      { $group: { _id: null, total: { $sum: '$value' }, count: { $sum: 1 } } },
    ]),
  ]);

  const find = (status) => byStatus.find(s => s._id === status)?.count || 0;
  return {
    total:     totals[0]?.count || 0,
    totalValue: totals[0]?.total || 0,
    new:       find('new_lead'),
    contacted: find('contacted'),
    won:       find('won'),
    lost:      find('lost'),
    byStatus,
  };
}

// ── GET /api/lead-streams/discover ────────────────────────────────────────────
// Auto-discovers distinct source streams from existing lead data.
// Returns three groups: meta_form, sheet_tab, source.
exports.discoverStreams = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);

    const [metaForms, sheetTabs, sources] = await Promise.all([
      // 1. Meta Forms — grouped by metaFormId
      Lead.aggregate([
        { $match: { ...tf, metaFormId: { $ne: null, $exists: true } } },
        {
          $group: {
            _id:  '$metaFormId',
            name: { $first: '$metaFormName' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 100 },
      ]),

      // 2. Google Sheet Tabs — grouped by sheetName, merged across both externalSource values
      Lead.aggregate([
        {
          $match: {
            ...tf,
            sheetName: { $ne: null, $exists: true },
            externalSource: { $in: ['google_sheet', 'google_sheets'] },
          },
        },
        {
          $group: {
            _id:   '$sheetName',
            count: { $sum: 1 },
            externalSources: { $addToSet: '$externalSource' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 100 },
      ]),

      // 3. Other sources — grouped by source enum value
      Lead.aggregate([
        { $match: { ...tf, source: { $ne: null, $exists: true } } },
        {
          $group: {
            _id:   '$source',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        meta_forms: metaForms.map(f => ({
          filterType: 'meta_form',
          filterId:   f._id,
          name:       f.name || f._id,
          count:      f.count,
          filter:     { metaFormId: f._id, metaFormName: f.name },
        })),
        sheet_tabs: sheetTabs.map(t => ({
          filterType: 'sheet_tab',
          filterId:   t._id,
          name:       t._id,
          count:      t.count,
          filter:     { sheetName: t._id },
          externalSources: t.externalSources,
        })),
        sources: sources.map(s => ({
          filterType: 'source',
          filterId:   s._id,
          name:       s._id,
          count:      s.count,
          filter:     { source: s._id },
        })),
      },
    });
  } catch (e) { next(e); }
};

// ── GET /api/lead-streams ──────────────────────────────────────────────────────
// Returns all saved stream configs for the tenant, each with a live lead count.
// Pinned streams come first, then ordered by `order` field.
exports.getLeadStreams = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);

    const streams = await LeadStream.find({ ...tf, isActive: true })
      .sort({ isPinned: -1, order: 1, createdAt: 1 })
      .lean();

    // Attach live counts for each stream
    const withCounts = await Promise.all(
      streams.map(async (s) => {
        const leadFilter = buildLeadFilter(tf, s.filter || {});
        const counts = await getStreamCounts(leadFilter);
        return { ...s, counts };
      })
    );

    res.json({ success: true, count: withCounts.length, data: withCounts });
  } catch (e) { next(e); }
};

// ── POST /api/lead-streams ─────────────────────────────────────────────────────
// Save/create a stream config (name, icon, color, filterType, filter).
exports.createLeadStream = async (req, res, next) => {
  try {
    const tenantId = injectTenantId(req);
    const { name, icon, color, order, filterType, filter, isPinned } = req.body;

    if (!name?.trim())   return next(err('name is required'));
    if (!filterType)     return next(err('filterType is required'));

    const validFilterTypes = ['meta_form', 'sheet_tab', 'source', 'campaign', 'custom'];
    if (!validFilterTypes.includes(filterType)) {
      return next(err(`filterType must be one of: ${validFilterTypes.join(', ')}`));
    }

    const stream = await LeadStream.create({
      tenantId,
      name: name.trim(),
      icon:        icon  || '📋',
      color:       color || '#6366f1',
      order:       order  ?? 0,
      filterType,
      filter:      filter || {},
      isPinned:    isPinned || false,
      isActive:    true,
      autoCreated: false,
      createdBy:   req.user.id,
    });

    res.status(201).json({ success: true, data: stream });
  } catch (e) { next(e); }
};

// ── GET /api/lead-streams/:id/stats ───────────────────────────────────────────
// Returns KPI stats for a single saved stream.
exports.getLeadStreamStats = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);

    const stream = await LeadStream.findOne({ _id: req.params.id, ...tf });
    if (!stream) return next(err('Lead stream not found', 404));

    const leadFilter = buildLeadFilter(tf, stream.filter || {});
    const counts = await getStreamCounts(leadFilter);

    const [byPriority, bySource] = await Promise.all([
      Lead.aggregate([
        { $match: leadFilter },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      Lead.aggregate([
        { $match: leadFilter },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        stream,
        ...counts,
        byPriority,
        bySource,
      },
    });
  } catch (e) { next(e); }
};

// ── PUT /api/lead-streams/:id ──────────────────────────────────────────────────
// Update name, icon, color, order, pin/unpin, active/inactive.
exports.updateLeadStream = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const stream = await LeadStream.findOne({ _id: req.params.id, ...tf });
    if (!stream) return next(err('Lead stream not found', 404));

    const allowed = ['name', 'icon', 'color', 'order', 'isPinned', 'isActive'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) stream[field] = req.body[field];
    });

    await stream.save();
    res.json({ success: true, data: stream });
  } catch (e) { next(e); }
};

// ── DELETE /api/lead-streams/:id ──────────────────────────────────────────────
// Remove saved config ONLY. Leads are NEVER deleted.
exports.deleteLeadStream = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const stream = await LeadStream.findOneAndDelete({ _id: req.params.id, ...tf });
    if (!stream) return next(err('Lead stream not found', 404));

    // Explicit confirmation: leads are untouched
    res.json({
      success: true,
      message: 'Lead source dashboard removed. No leads were deleted.',
    });
  } catch (e) { next(e); }
};

// ── GET /api/lead-streams/stats-by-filter ─────────────────────────────────────
// Quick stats for an ad-hoc filter (no saved stream required).
// Used by the LeadStreamDashboard when opened for an auto-discovered stream
// that has no saved LeadStream document yet.
exports.getStatsByFilter = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);

    const streamFilter = {};
    if (req.query.metaFormId)     streamFilter.metaFormId     = req.query.metaFormId;
    if (req.query.sheetName)      streamFilter.sheetName      = req.query.sheetName;
    if (req.query.spreadsheetId)  streamFilter.spreadsheetId  = req.query.spreadsheetId;
    if (req.query.source)         streamFilter.source         = req.query.source;
    if (req.query.campaignId)     streamFilter.campaignId     = req.query.campaignId;
    if (req.query.externalSource) streamFilter.externalSource = req.query.externalSource;

    const leadFilter = buildLeadFilter(tf, streamFilter);
    const counts = await getStreamCounts(leadFilter);

    res.json({ success: true, data: counts });
  } catch (e) { next(e); }
};
