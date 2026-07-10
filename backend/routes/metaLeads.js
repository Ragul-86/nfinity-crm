const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const {
  getKPIs,
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  addNote,
  getCampaignAnalytics,
  updateCampaignFinancials,
  exportLeads,
  syncLeads,
  verifyWebhook,
  receiveWebhook,
} = require('../controllers/metaLeadController')

// Public webhook endpoints (Meta calls these - no auth)
router.get('/webhook', verifyWebhook)
router.post('/webhook', receiveWebhook)

// Protected routes
router.use(protect)

router.get('/kpis', getKPIs)
router.get('/export', exportLeads)
router.post('/sync', authorize('super_admin', 'admin', 'manager'), syncLeads)

router.get('/campaigns', getCampaignAnalytics)
router.post('/campaigns/financials', authorize('super_admin', 'admin'), updateCampaignFinancials)

router.route('/')
  .get(getLeads)
  .post(authorize('super_admin', 'admin', 'manager'), createLead)

router.route('/:id')
  .get(getLeadById)
  .put(updateLead)
  .delete(authorize('super_admin', 'admin'), deleteLead)

router.post('/:id/notes', addNote)

module.exports = router
