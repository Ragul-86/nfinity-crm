const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const {
  getKanban, getLeads, getSummary, getAnalytics, getForecasting,
  createLead, updateLead, moveLead, convertToClient, deleteLead,
  exportLeads, pipelineBulkAction,
} = require('../controllers/pipelineController')

router.use(protect)

router.get('/kanban', getKanban)
router.get('/summary', getSummary)
router.get('/analytics', getAnalytics)
router.get('/forecast', getForecasting)
router.get('/export', exportLeads)
router.get('/', getLeads)
router.post('/', createLead)
router.post('/bulk', authorize('super_admin', 'admin', 'manager'), pipelineBulkAction)
router.put('/:id', updateLead)
router.put('/:id/move', moveLead)
router.post('/:id/convert', authorize('super_admin', 'admin', 'manager'), convertToClient)
router.delete('/:id', authorize('super_admin', 'admin', 'manager'), deleteLead)

module.exports = router
