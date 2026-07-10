// Hybrid Campaign Access Control helpers.
//
// Employees can always SEE every campaign (read-only visibility), but can
// only WORK inside campaigns an Admin/Super Admin/Manager explicitly
// assigned them to via Campaign.assignedTeam. Admin/Super Admin/Manager
// bypass every restriction.

const Campaign = require('../models/Campaign');

const ADMIN_BYPASS_ROLES = ['super_admin', 'admin', 'manager'];

const NO_ACCESS_MESSAGE =
  "You don't have access to work on this campaign. Please contact your Admin if access is required.";

// Fields a non-admin (employee/viewer) should never see, regardless of
// whether they're assigned — financial settings stay admin/manager-only.
// Note: `analytics` (leadsGenerated/conversions/conversionRate/ctr etc.) is
// intentionally NOT stripped — employees are allowed a "high-level
// performance summary" per the access-control spec. performanceTrend (the
// granular day-by-day spend/lead graph) stays hidden alongside budget/spend/roi.
const FINANCIAL_FIELDS = ['budget', 'spend', 'roi', 'performanceTrend'];

function isAssignedToCampaign(campaign, userId) {
  if (!campaign || !userId) return false;
  const uid = userId.toString();
  return (campaign.assignedTeam || []).some(t => t.user && t.user.toString() === uid);
}

function getAccessType(campaign, user) {
  if (!user) return 'VIEW_ONLY';
  if (ADMIN_BYPASS_ROLES.includes(user.role)) return 'ASSIGNED';
  return isAssignedToCampaign(campaign, user._id) ? 'ASSIGNED' : 'VIEW_ONLY';
}

function getMyRoleOnCampaign(campaign, userId) {
  if (!campaign || !userId) return null;
  const uid = userId.toString();
  const entry = (campaign.assignedTeam || []).find(t => t.user && t.user.toString() === uid);
  return entry ? entry.role : null;
}

// Strips financial/sensitive fields from a campaign for employee/viewer
// roles. Accepts either a mongoose doc or a plain object; always returns a
// plain object safe to send to res.json.
function sanitizeCampaignForUser(campaign, user) {
  const obj = typeof campaign.toObject === 'function' ? campaign.toObject() : { ...campaign };
  obj.accessType = getAccessType(campaign, user);
  obj.myRole = getMyRoleOnCampaign(campaign, user?._id);

  if (user && !ADMIN_BYPASS_ROLES.includes(user.role)) {
    FINANCIAL_FIELDS.forEach(f => delete obj[f]);
  }
  return obj;
}

// Express middleware: enforces work-access on a campaign-scoped route.
// Admin/Super Admin/Manager always pass. Employees must be in assignedTeam.
const requireCampaignAccess = (paramName = 'id') => async (req, res, next) => {
  try {
    if (ADMIN_BYPASS_ROLES.includes(req.user.role)) return next();

    const campaignId = req.params[paramName];
    const campaign = await Campaign.findById(campaignId).select('assignedTeam');
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    if (!isAssignedToCampaign(campaign, req.user._id)) {
      return res.status(403).json({ success: false, message: NO_ACCESS_MESSAGE });
    }
    req.campaign = campaign;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  ADMIN_BYPASS_ROLES,
  NO_ACCESS_MESSAGE,
  FINANCIAL_FIELDS,
  isAssignedToCampaign,
  getAccessType,
  getMyRoleOnCampaign,
  sanitizeCampaignForUser,
  requireCampaignAccess,
};
