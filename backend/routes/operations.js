const express = require('express')
const router  = express.Router()
const { protect, authorize } = require('../middleware/auth')
const ctrl = require('../controllers/operationsController')

router.use(protect)

// ── Calendar ────────────────────────────────────────────────────────────────
router.get('/calendar', ctrl.getCalendarEvents)

// ── Operations Dashboard ────────────────────────────────────────────────────
router.get('/dashboard', ctrl.getOperationsDashboard)

// ── Task extras ─────────────────────────────────────────────────────────────
router.post('/tasks/:id/duplicate', ctrl.duplicateTask)
router.get('/tasks/stats', ctrl.getTaskStats)

// ── Meetings ─────────────────────────────────────────────────────────────────
router.get('/meetings',    ctrl.getMeetings)
router.post('/meetings',   ctrl.createMeeting)
router.get('/meetings/:id',    ctrl.getMeeting)
router.put('/meetings/:id',    ctrl.updateMeeting)
router.delete('/meetings/:id', authorize('manager','admin','super_admin','client_super_admin'), ctrl.deleteMeeting)

// ── Customer Ops ──────────────────────────────────────────────────────────────
router.get('/customer/:clientId/ops',        ctrl.getCustomerOps)
router.post('/customer/:clientId/assign-sop', ctrl.assignSOPToCustomer)
router.patch('/assignments/:assignmentId/items/:itemId', ctrl.updateChecklistItem)

module.exports = router
