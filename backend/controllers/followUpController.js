const FollowUp = require('../models/FollowUp');
const LeadActivity = require('../models/LeadActivity');
const Lead = require('../models/Lead');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');

const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

async function logActivity(leadId, tenantId, type, description, userId, extra = {}) {
  try {
    await LeadActivity.create({ lead: leadId, tenantId, type, description, performedBy: userId, ...extra });
  } catch (_) {}
}

// ── GET /api/follow-ups?leadId= ───────────────────────────────────────────────
exports.getFollowUps = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const filter = { tenantId: tf.tenantId };

    if (req.query.leadId) filter.lead = req.query.leadId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;

    // Employees only see their own follow-ups
    if (req.user.role === 'employee') filter.assignedTo = req.user.id;

    // Date range filter
    if (req.query.from || req.query.to) {
      filter.scheduledAt = {};
      if (req.query.from) filter.scheduledAt.$gte = new Date(req.query.from);
      if (req.query.to)   filter.scheduledAt.$lte = new Date(req.query.to);
    }

    const followUps = await FollowUp.find(filter)
      .populate('lead', 'name company phone leadId')
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email')
      .sort({ scheduledAt: 1 });

    res.json({ success: true, count: followUps.length, data: followUps });
  } catch (e) { next(e); }
};

// ── GET /api/follow-ups/:id ────────────────────────────────────────────────────
exports.getFollowUp = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const followUp = await FollowUp.findOne({ _id: req.params.id, tenantId: tf.tenantId })
      .populate('lead', 'name company phone leadId')
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email');
    if (!followUp) return next(err('Follow-up not found', 404));
    res.json({ success: true, data: followUp });
  } catch (e) { next(e); }
};

// ── POST /api/follow-ups ───────────────────────────────────────────────────────
exports.createFollowUp = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const { leadId, ...rest } = req.body;
    if (!leadId) return next(err('leadId is required'));

    // Verify lead belongs to tenant
    const lead = await Lead.findOne({ _id: leadId, ...tf });
    if (!lead) return next(err('Lead not found', 404));

    const followUp = await FollowUp.create({
      ...rest,
      lead: leadId,
      tenantId: tf.tenantId,
      createdBy: req.user.id,
    });

    await logActivity(leadId, lead.tenantId, 'follow_up_scheduled',
      `Follow-up scheduled for ${new Date(followUp.scheduledAt).toLocaleDateString()} via ${followUp.mode}`,
      req.user.id, { metadata: { followUpId: followUp._id } });

    // Update lead's quick followUpDate
    await Lead.findByIdAndUpdate(leadId, { followUpDate: followUp.scheduledAt });

    const populated = await FollowUp.findById(followUp._id)
      .populate('lead', 'name company phone leadId')
      .populate('assignedTo', 'name email avatar')
      .populate('createdBy', 'name email');

    res.status(201).json({ success: true, data: populated });
  } catch (e) { next(e); }
};

// ── PUT /api/follow-ups/:id ────────────────────────────────────────────────────
exports.updateFollowUp = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const followUp = await FollowUp.findOneAndUpdate(
      { _id: req.params.id, tenantId: tf.tenantId },
      req.body,
      { new: true, runValidators: true }
    ).populate('lead', 'name company phone leadId')
     .populate('assignedTo', 'name email avatar');

    if (!followUp) return next(err('Follow-up not found', 404));
    res.json({ success: true, data: followUp });
  } catch (e) { next(e); }
};

// ── POST /api/follow-ups/:id/complete ─────────────────────────────────────────
exports.completeFollowUp = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const followUp = await FollowUp.findOne({ _id: req.params.id, tenantId: tf.tenantId });
    if (!followUp) return next(err('Follow-up not found', 404));

    followUp.status = 'completed';
    followUp.completedAt = new Date();
    if (req.body.outcome) followUp.outcome = req.body.outcome;
    await followUp.save();

    await logActivity(followUp.lead, tf.tenantId, 'follow_up_completed',
      `Follow-up completed${followUp.outcome ? ': ' + followUp.outcome : ''}`,
      req.user.id, { metadata: { followUpId: followUp._id } });

    res.json({ success: true, data: followUp });
  } catch (e) { next(e); }
};

// ── DELETE /api/follow-ups/:id ─────────────────────────────────────────────────
exports.deleteFollowUp = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const followUp = await FollowUp.findOneAndDelete({ _id: req.params.id, tenantId: tf.tenantId });
    if (!followUp) return next(err('Follow-up not found', 404));

    await logActivity(followUp.lead, tf.tenantId, 'follow_up_cancelled',
      `Follow-up cancelled by ${req.user.name}`, req.user.id);

    res.json({ success: true, message: 'Follow-up deleted' });
  } catch (e) { next(e); }
};
