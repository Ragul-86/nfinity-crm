const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getDashboardStats, getRevenueReport, getEmployeeDashboard } = require('../controllers/dashboardController');

router.use(protect);
router.get('/stats', getDashboardStats);
router.get('/employee-stats', getEmployeeDashboard);
router.get('/revenue', getRevenueReport);
module.exports = router;
