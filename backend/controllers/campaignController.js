const Campaign = require('../models/Campaign');
const Lead = require('../models/Lead');
const Task = require('../models/Task');
const SOPAssignment = require('../models/SOPAssignment');
const APIFeatures = require('../utils/apiFeatures');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');
const {
  ADMIN_BYPASS_ROLES,
  sanitizeCampaignForUser,
} = require('../middleware/campaignAccess');

const POPULATE_FIELDS = [
  ['client', 'companyName'],
  ['assignedManager', 'name avatar'],
  ['assignedTeam.user', 'name email avatar designation'],
];

function applyPopulate(query) {
  return POPULATE_FIELDS.reduce((q, [path, select]) => q.populate(path, select), query);
}

// ─── Campaigns (Read-Only for everyone, sanitized per role) ───────────────
exports.getCampaigns = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const features = new APIFeatures(
      applyPopulate(Campaign.find({ isArchived: false, ...tf })),
      req.query
    ).search(['name', 'type']).filter().sort().paginate();

    const [campaigns, total] = await Promise.all([
      features.query,
      Campaign.countDocuments({ isArchived: false, ...tf }),
    ]);

    const data = campaigns.map(c => sanitizeCampaignForUser(c, req.user));
    res.status(200).json({ success: true, count: data.length, total, page: features.page, limit: features.limit, data });
  } catch (error) { next(error); }
};

exports.getCampaign = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const campaign = await applyPopulate(
      Campaign.findOne({ _id: req.params.id, ...tf }).populate('client', 'companyName email phone')
    );
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.status(200).json({ success: true, data: sanitizeCampaignForUser(campaign, req.user) });
  } catch (error) { next(error); }
};

// ─── My Campaigns (assigned work area) ─────────────────────────────────────
exports.getMyCampaigns = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const tf = getTenantFilter(req);
    const isBypass = ADMIN_BYPASS_ROLES.includes(req.user.role);

    const filter = isBypass
      ? { isArchived: false, ...tf }
      : { isArchived: false, 'assignedTeam.user': userId, ...tf };

    const campaigns = await applyPopulate(Campaign.find(filter).sort('-updatedAt'));

    const data = await Promise.all(campaigns.map(async (c) => {
      const [dueTasksCount, assignedLeadsCount, sopAssignments] = await Promise.all([
        Task.countDocuments({ campaign: c._id, assignedTo: userId, status: { $ne: 'completed' }, ...tf }),
        Lead.countDocuments({ campaign: c._id, assignedTo: userId, ...tf }),
        SOPAssignment.find({ campaign: c._id, assignedTo: userId, ...tf }).select('progress'),
      ]);
      const sopProgress = sopAssignments.length
        ? Math.round(sopAssignments.reduce((a, s) => a + (s.progress || 0), 0) / sopAssignments.length)
        : null;

      const sanitized = sanitizeCampaignForUser(c, req.user);
      return { ...sanitized, dueTasksCount, assignedLeadsCount, sopProgress };
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) { next(error); }
};

// ─── Campaign-scoped workspace resources (work access required) ───────────
exports.getCampaignLeads = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const filter = { campaign: req.params.id, ...tf };
    if (!ADMIN_BYPASS_ROLES.includes(req.user.role)) filter.assignedTo = req.user._id;
    const leads = await Lead.find(filter).populate('assignedTo', 'name avatar').sort('-updatedAt');
    res.status(200).json({ success: true, count: leads.length, data: leads });
  } catch (error) { next(error); }
};

exports.getCampaignTasks = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const filter = { campaign: req.params.id, ...tf };
    if (!ADMIN_BYPASS_ROLES.includes(req.user.role)) filter.assignedTo = req.user._id;
    const tasks = await Task.find(filter).populate('assignedTo', 'name avatar').sort('dueDate');
    res.status(200).json({ success: true, count: tasks.length, data: tasks });
  } catch (error) { next(error); }
};

exports.getCampaignSopAssignments = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const filter = { campaign: req.params.id, ...tf };
    if (!ADMIN_BYPASS_ROLES.includes(req.user.role)) filter.assignedTo = req.user._id;
    const assignments = await SOPAssignment.find(filter).populate('assignedTo', 'name avatar').sort('-updatedAt');
    res.status(200).json({ success: true, count: assignments.length, data: assignments });
  } catch (error) { next(error); }
};

exports.addCampaignNote = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const campaign = req.campaign || await Campaign.findOne({ _id: req.params.id, ...tf });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    campaign.notes.unshift({ text: req.body.text, author: req.user.id });
    await campaign.save();
    res.status(201).json({ success: true, data: campaign.notes[0] });
  } catch (error) { next(error); }
};

exports.addCampaignAsset = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const campaign = req.campaign || await Campaign.findOne({ _id: req.params.id, ...tf });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    campaign.assets.unshift({
      name: req.body.name,
      fileUrl: req.body.fileUrl,
      fileType: req.body.fileType || '',
      uploadedBy: req.user.id,
    });
    await campaign.save();
    res.status(201).json({ success: true, data: campaign.assets[0] });
  } catch (error) { next(error); }
};

// ─── Admin/Super Admin/Manager management ──────────────────────────────────
function normalizeAssignedTeam(body) {
  if (Array.isArray(body.assignedTeam)) {
    return body.assignedTeam
      .filter(t => t && t.user)
      .map(t => ({ user: t.user, role: t.role || '' }));
  }
  if (Array.isArray(body.teamMembers)) {
    return body.teamMembers.map(u => ({ user: u, role: '' }));
  }
  return undefined;
}

exports.createCampaign = async (req, res, next) => {
  try {
    const assignedTeam = normalizeAssignedTeam(req.body);
    const campaign = await Campaign.create({
      ...req.body,
      ...(assignedTeam ? { assignedTeam } : {}),
      createdBy: req.user.id,
      tenantId: injectTenantId(req),
    });
    res.status(201).json({ success: true, data: campaign });
  } catch (error) { next(error); }
};

exports.updateCampaign = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const assignedTeam = normalizeAssignedTeam(req.body);
    const update = { ...req.body, ...(assignedTeam ? { assignedTeam } : {}) };
    const campaign = await Campaign.findOne({ _id: req.params.id, ...tf });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    Object.assign(campaign, update);
    await campaign.save();
    res.status(200).json({ success: true, data: campaign });
  } catch (error) { next(error); }
};

exports.deleteCampaign = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    await Campaign.findOneAndDelete({ _id: req.params.id, ...tf });
    res.status(200).json({ success: true, message: 'Campaign deleted' });
  } catch (error) { next(error); }
};

exports.duplicateCampaign = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const original = await Campaign.findOne({ _id: req.params.id, ...tf });
    if (!original) return res.status(404).json({ success: false, message: 'Campaign not found' });
    const { _id, createdAt, updatedAt, ...rest } = original.toObject();
    const duplicate = await Campaign.create({
      ...rest,
      name: `${rest.name} (Copy)`,
      status: 'draft',
      createdBy: req.user.id,
      tenantId: injectTenantId(req),
    });
    res.status(201).json({ success: true, data: duplicate });
  } catch (error) { next(error); }
};

exports.archiveCampaign = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const campaign = await Campaign.findOneAndUpdate(
      { _id: req.params.id, ...tf },
      { isArchived: true },
      { new: true }
    );
    res.status(200).json({ success: true, data: campaign });
  } catch (error) { next(error); }
};

exports.getCampaignStats = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const stats = await Campaign.aggregate([
      { $match: { isArchived: false, ...tf } },
      { $group: { _id: '$status', count: { $sum: 1 }, totalBudget: { $sum: '$budget' }, totalSpend: { $sum: '$spend' } } }
    ]);
    res.status(200).json({ success: true, data: stats });
  } catch (error) { next(error); }
};
