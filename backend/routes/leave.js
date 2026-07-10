const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  applyLeave, getMyLeaves, cancelLeave,
  getAllLeaves, approveLeave, rejectLeave,
  getLeaveBalance,
} = require('../controllers/leaveController');

router.use(protect);

router.get('/balance', getLeaveBalance);
router.post('/', applyLeave);
router.get('/my', getMyLeaves);
router.put('/:id/cancel', cancelLeave);

router.get('/all', authorize('super_admin', 'admin', 'manager'), getAllLeaves);
router.put('/:id/approve', authorize('super_admin', 'admin', 'manager'), approveLeave);
router.put('/:id/reject', authorize('super_admin', 'admin', 'manager'), rejectLeave);

module.exports = router;
