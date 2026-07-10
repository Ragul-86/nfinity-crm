const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/analyticsController');

router.use(protect);

// ── Executive Command Center ────────────────────────────────────────────────
router.get('/command-center',    ctrl.getCommandCenterKPIs);
router.get('/pipeline-snapshot', ctrl.getPipelineSnapshot);
router.get('/finance-snapshot',  ctrl.getFinanceSnapshot);
router.get('/team-snapshot',     ctrl.getTeamSnapshot);
router.get('/customer-snapshot', ctrl.getCustomerSnapshot);
router.get('/activity-feed',     ctrl.getActivityFeed);
router.get('/my-work',           ctrl.getMyWork);
router.get('/sales-performance', authorize('manager','admin','super_admin','client_super_admin'), ctrl.getSalesPerformance);
router.get('/business-insights', authorize('manager','admin','super_admin','client_super_admin'), ctrl.getBusinessInsights);

// ── Analytics ───────────────────────────────────────────────────────────────
router.get('/leads',    ctrl.getLeadAnalytics);
router.get('/revenue',  ctrl.getRevenueAnalytics);
router.get('/tasks',    ctrl.getTaskAnalytics);
router.get('/sop',      ctrl.getSOPAnalytics);

// ── Reports ─────────────────────────────────────────────────────────────────
router.get('/reports/sales',      authorize('manager','admin','super_admin','client_super_admin'), ctrl.getSalesReport);
router.get('/reports/invoices',   authorize('manager','admin','super_admin','client_super_admin'), ctrl.getInvoiceReport);
router.get('/reports/payments',   authorize('manager','admin','super_admin','client_super_admin'), ctrl.getPaymentReport);
router.get('/reports/customers',  ctrl.getCustomerReport);
router.get('/reports/leads',      ctrl.getLeadReport);
router.get('/reports/tasks',      ctrl.getTaskReport);
router.get('/reports/sop',        ctrl.getSOPReport);
router.get('/reports/employees',  authorize('admin','super_admin','client_super_admin'), ctrl.getEmployeeReport);
router.get('/reports/quotations', ctrl.getQuotationReport);

module.exports = router;
