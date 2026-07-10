const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { requireCampaignAccess } = require('../middleware/campaignAccess');
const {
  getCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign,
  duplicateCampaign, archiveCampaign, getCampaignStats,
  getMyCampaigns, getCampaignLeads, getCampaignTasks, getCampaignSopAssignments,
  addCampaignNote, addCampaignAsset,
} = require('../controllers/campaignController');

router.use(protect);

router.get('/stats', authorize('super_admin', 'admin', 'manager'), getCampaignStats);

// My Campaigns workspace — must come before the /:id param routes.
router.get('/my', getMyCampaigns);

router.route('/')
  .get(getCampaigns)
  .post(authorize('super_admin', 'admin', 'manager'), createCampaign);

router.route('/:id')
  .get(getCampaign)
  .put(authorize('super_admin', 'admin', 'manager'), updateCampaign)
  .delete(authorize('super_admin', 'admin'), deleteCampaign);

router.post('/:id/duplicate', authorize('super_admin', 'admin', 'manager'), duplicateCampaign);
router.put('/:id/archive', authorize('super_admin', 'admin', 'manager'), archiveCampaign);

// Campaign-scoped workspace resources — require assigned work access
// (admins/managers bypass automatically inside the middleware).
router.get('/:id/leads', requireCampaignAccess('id'), getCampaignLeads);
router.get('/:id/tasks', requireCampaignAccess('id'), getCampaignTasks);
router.get('/:id/sop-assignments', requireCampaignAccess('id'), getCampaignSopAssignments);
router.post('/:id/notes', requireCampaignAccess('id'), addCampaignNote);
router.post('/:id/assets', requireCampaignAccess('id'), addCampaignAsset);

module.exports = router;
