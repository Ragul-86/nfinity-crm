const express = require('express')
const router = express.Router()
const { protect, authorize } = require('../middleware/auth')
const c = require('../controllers/financeController')

router.use(protect)

const MANAGERS = ['super_admin', 'admin', 'manager']
const ADMINS   = ['super_admin', 'admin']

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard',    c.getDashboard)

// ── Invoices ──────────────────────────────────────────────────────────────────
router.get('/invoices',                              c.getInvoices)
router.post('/invoices',            authorize(...MANAGERS), c.createInvoice)
router.put('/invoices/:id',         authorize(...MANAGERS), c.updateInvoice)
router.post('/invoices/:id/duplicate', authorize(...MANAGERS), c.duplicateInvoice)
router.post('/invoices/:invoiceId/payments', authorize(...MANAGERS), c.recordPayment)
router.post('/invoices/:id/cancel', authorize(...MANAGERS), c.cancelInvoice)
router.delete('/invoices/:id',      authorize(...ADMINS),   c.deleteInvoice)

// ── Payments ──────────────────────────────────────────────────────────────────
router.get('/payments',             c.getPayments)
router.put('/payments/:id',         authorize(...MANAGERS), c.updatePayment)

// ── Quotations ────────────────────────────────────────────────────────────────
router.get('/quotations',                            c.getQuotations)
router.post('/quotations',          authorize(...MANAGERS), c.createQuotation)
router.put('/quotations/:id',       authorize(...MANAGERS), c.updateQuotation)
router.post('/quotations/:id/duplicate', authorize(...MANAGERS), c.duplicateQuotation)
router.post('/quotations/:id/convert',   authorize(...MANAGERS), c.convertQuotation)
router.delete('/quotations/:id',    authorize(...ADMINS),   c.deleteQuotation)

// ── Collections ───────────────────────────────────────────────────────────────
router.get('/collections',          c.getCollections)

// ── GST ───────────────────────────────────────────────────────────────────────
router.get('/gst-summary',          c.getGSTSummary)

// ── Revenue ───────────────────────────────────────────────────────────────────
router.get('/revenue',              c.getRevenueSummary)

// ── Credit Notes ──────────────────────────────────────────────────────────────
router.get('/credit-notes',         c.getCreditNotes)
router.post('/credit-notes',        authorize(...MANAGERS), c.createCreditNote)
router.put('/credit-notes/:id',     authorize(...MANAGERS), c.updateCreditNote)
router.delete('/credit-notes/:id',  authorize(...ADMINS),   c.deleteCreditNote)

// ── Debit Notes ───────────────────────────────────────────────────────────────
router.get('/debit-notes',          c.getDebitNotes)
router.post('/debit-notes',         authorize(...MANAGERS), c.createDebitNote)
router.put('/debit-notes/:id',      authorize(...MANAGERS), c.updateDebitNote)
router.delete('/debit-notes/:id',   authorize(...ADMINS),   c.deleteDebitNote)

// ── Bulk + Export ─────────────────────────────────────────────────────────────
router.post('/bulk',                authorize(...MANAGERS), c.bulkAction)
router.get('/export',               c.exportCSV)

module.exports = router
