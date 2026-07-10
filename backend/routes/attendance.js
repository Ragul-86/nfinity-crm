const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  clockIn, clockOut, breakStart, breakEnd,
  getMyAttendance, getAllAttendance, getTodayStatus,
  markAttendance, deleteAttendance,
  getDashboardStats, getTrend, getDepartmentWise, getMonthlyOverview,
  getReport, exportReport,
} = require('../controllers/attendanceController');

router.use(protect);

// Daily attendance (self-service)
router.post('/clock-in', clockIn);
router.post('/clock-out', clockOut);
router.post('/break-start', breakStart);
router.post('/break-end', breakEnd);
router.get('/my', getMyAttendance);
router.get('/today', getTodayStatus);
router.get('/all', authorize('super_admin', 'admin', 'manager'), getAllAttendance);

// Dashboard widgets
router.get('/dashboard-stats', authorize('super_admin', 'admin', 'manager'), getDashboardStats);
router.get('/trend', authorize('super_admin', 'admin', 'manager'), getTrend);
router.get('/department-wise', authorize('super_admin', 'admin', 'manager'), getDepartmentWise);
router.get('/monthly-overview', authorize('super_admin', 'admin', 'manager'), getMonthlyOverview);

// Reports + export
router.get('/report', authorize('super_admin', 'admin', 'manager'), getReport);
router.get('/export', authorize('super_admin', 'admin', 'manager'), exportReport);

// Manual record management
router.post('/mark', authorize('super_admin', 'admin', 'manager'), markAttendance);
router.delete('/:id', authorize('super_admin', 'admin'), deleteAttendance);

module.exports = router;
