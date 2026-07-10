const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const c = require('../controllers/customerController')

router.use(protect)

const MANAGERS = ['super_admin', 'admin', 'manager']

// ── Workspace summary ────────────────────────────────────────────────────────
router.get('/:id/workspace',       c.getWorkspace)
router.get('/:id/timeline',        c.getTimeline)
router.post('/:id/activities',     c.addActivity)
router.get('/:id/health',          c.getHealth)
router.get('/:id/reports',         c.getReports)

// ── Invoices ─────────────────────────────────────────────────────────────────
router.get('/:id/invoices',        c.getInvoices)
router.post('/:id/invoices',       authorize(...MANAGERS), c.createInvoice)
router.put('/invoices/:invoiceId',  authorize(...MANAGERS), c.updateInvoice)
router.post('/invoices/:invoiceId/mark-paid', authorize(...MANAGERS), c.markInvoicePaid)
router.delete('/invoices/:invoiceId', authorize('super_admin', 'admin'), c.deleteInvoice)

// ── Quotations ────────────────────────────────────────────────────────────────
router.get('/:id/quotations',      c.getQuotations)
router.post('/:id/quotations',     authorize(...MANAGERS), c.createQuotation)
router.put('/quotations/:quoteId', authorize(...MANAGERS), c.updateQuotation)
router.post('/quotations/:quoteId/convert', authorize(...MANAGERS), c.convertQuotation)
router.delete('/quotations/:quoteId', authorize('super_admin', 'admin'), c.deleteQuotation)

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get('/:id/tasks',           c.getTasks)
router.post('/:id/tasks',          c.createTask)
router.put('/tasks/:taskId',       c.updateTask)

// ── SOP Progress ──────────────────────────────────────────────────────────────
router.get('/:id/sop',             c.getSOPProgress)

// ── Notes ─────────────────────────────────────────────────────────────────────
router.get('/:id/notes',           c.getNotes)
router.post('/:id/notes',          c.createNote)
router.put('/notes/:noteId',       c.updateNote)
router.delete('/notes/:noteId',    c.deleteNote)

// ── Files ─────────────────────────────────────────────────────────────────────
router.get('/:id/files',           c.getFiles)
router.post('/:id/files',          c.addFile)
router.delete('/files/:fileId',    authorize(...MANAGERS), c.deleteFile)

// ── Meetings ──────────────────────────────────────────────────────────────────
router.get('/:id/meetings',        c.getMeetings)
router.post('/:id/meetings',       c.createMeeting)
router.put('/meetings/:meetingId', c.updateMeeting)
router.delete('/meetings/:meetingId', c.deleteMeeting)

// ── Lead History ──────────────────────────────────────────────────────────────
router.get('/:id/lead-history',    c.getLeadHistory)

// ── Communication ─────────────────────────────────────────────────────────────
router.get('/:id/communication',   c.getCommunication)
router.post('/:id/communication',  c.addCommunicationEntry)

module.exports = router
