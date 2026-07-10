const Leave = require('../models/Leave');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');

const BALANCE_TYPES = ['casual', 'sick', 'earned'];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function daysBetweenInclusive(start, end) {
  const ms = startOfDay(end) - startOfDay(start);
  return Math.round(ms / 86400000) + 1;
}

// ============ Apply / view / cancel (employee) ============

exports.applyLeave = async (req, res, next) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body;
    if (!leaveType || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'leaveType, startDate and endDate are required' });
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return res.status(400).json({ success: false, message: 'endDate cannot be before startDate' });
    const totalDays = daysBetweenInclusive(start, end);

    if (BALANCE_TYPES.includes(leaveType)) {
      const user = await User.findById(req.user.id);
      const available = user.leaveBalance?.[leaveType] ?? 0;
      if (totalDays > available) {
        return res.status(400).json({ success: false, message: `Insufficient ${leaveType} leave balance. Available: ${available} day(s)` });
      }
    }

    const leave = await Leave.create({
      employee: req.user.id,
      leaveType,
      startDate: start,
      endDate: end,
      totalDays,
      reason: reason || '',
      tenantId: injectTenantId(req),
    });
    res.status(201).json({ success: true, data: leave });
  } catch (error) { next(error); }
};

exports.getMyLeaves = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { employee: req.user.id };
    if (status) filter.status = status;
    const leaves = await Leave.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: leaves });
  } catch (error) { next(error); }
};

exports.cancelLeave = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const leave = await Leave.findOne({ _id: req.params.id, ...tf });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave request not found' });
    if (leave.employee.toString() !== req.user.id && !['super_admin', 'admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this leave' });
    }
    if (leave.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Leave already cancelled' });
    }
    const wasApproved = leave.status === 'approved';
    leave.status = 'cancelled';
    await leave.save();

    if (wasApproved) {
      if (BALANCE_TYPES.includes(leave.leaveType)) {
        await User.findByIdAndUpdate(leave.employee, { $inc: { [`leaveBalance.${leave.leaveType}`]: leave.totalDays } });
      }
      await Attendance.deleteMany({
        employee: leave.employee,
        date: { $gte: startOfDay(leave.startDate), $lte: startOfDay(leave.endDate) },
        status: { $in: ['leave', 'work_from_home'] },
        ...tf,
      });
    }
    res.status(200).json({ success: true, data: leave });
  } catch (error) { next(error); }
};

// ============ Approve / reject (admin / manager) ============

exports.getAllLeaves = async (req, res, next) => {
  try {
    const { status, employee, leaveType } = req.query;
    const tf = getTenantFilter(req);
    const filter = { ...tf };
    if (status) filter.status = status;
    if (employee) filter.employee = employee;
    if (leaveType) filter.leaveType = leaveType;
    const leaves = await Leave.find(filter)
      .populate('employee', 'name email avatar department')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: leaves });
  } catch (error) { next(error); }
};

exports.approveLeave = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const leave = await Leave.findOne({ _id: req.params.id, ...tf });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave request not found' });
    if (leave.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Leave is already ${leave.status}` });
    }

    if (BALANCE_TYPES.includes(leave.leaveType)) {
      const user = await User.findById(leave.employee);
      const available = user.leaveBalance?.[leave.leaveType] ?? 0;
      if (leave.totalDays > available) {
        return res.status(400).json({ success: false, message: `Employee has insufficient ${leave.leaveType} balance` });
      }
      await User.findByIdAndUpdate(leave.employee, { $inc: { [`leaveBalance.${leave.leaveType}`]: -leave.totalDays } });
    }

    leave.status = 'approved';
    leave.approvedBy = req.user.id;
    leave.approvedAt = new Date();
    await leave.save();

    // Reflect approved leave on the attendance calendar
    const employeeUser = await User.findById(leave.employee);
    const attendanceStatus = leave.leaveType === 'work_from_home' ? 'work_from_home' : 'leave';
    const tenantId = injectTenantId(req);
    const cursor = startOfDay(leave.startDate);
    const last = startOfDay(leave.endDate);
    const ops = [];
    while (cursor <= last) {
      ops.push(
        Attendance.findOneAndUpdate(
          { employee: leave.employee, date: new Date(cursor), ...tf },
          {
            $set: {
              status: attendanceStatus,
              leaveType: leave.leaveType,
              department: employeeUser?.department || '',
              notes: leave.reason || '',
              tenantId,
            },
            $setOnInsert: { employee: leave.employee, date: new Date(cursor), tenantId },
          },
          { upsert: true }
        )
      );
      cursor.setDate(cursor.getDate() + 1);
    }
    await Promise.all(ops);

    const populated = await Leave.findById(leave._id).populate('employee', 'name email avatar department').populate('approvedBy', 'name');
    res.status(200).json({ success: true, data: populated });
  } catch (error) { next(error); }
};

exports.rejectLeave = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const leave = await Leave.findOne({ _id: req.params.id, ...tf });
    if (!leave) return res.status(404).json({ success: false, message: 'Leave request not found' });
    if (leave.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Leave is already ${leave.status}` });
    }
    leave.status = 'rejected';
    leave.approvedBy = req.user.id;
    leave.approvedAt = new Date();
    leave.rejectionReason = req.body.rejectionReason || '';
    await leave.save();
    const populated = await Leave.findById(leave._id).populate('employee', 'name email avatar department').populate('approvedBy', 'name');
    res.status(200).json({ success: true, data: populated });
  } catch (error) { next(error); }
};

// ============ Leave balance ============

exports.getLeaveBalance = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const targetId = req.query.employee && ['super_admin', 'admin', 'manager'].includes(req.user.role)
      ? req.query.employee
      : req.user.id;
    const user = await User.findById(targetId, 'leaveBalance name');
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' });
    const usedAgg = await Leave.aggregate([
      { $match: { employee: user._id, status: 'approved', ...tf } },
      { $group: { _id: '$leaveType', usedDays: { $sum: '$totalDays' } } },
    ]);
    const used = {};
    usedAgg.forEach(u => { used[u._id] = u.usedDays; });
    res.status(200).json({
      success: true,
      data: {
        casual: { balance: user.leaveBalance?.casual ?? 0, used: used.casual || 0 },
        sick: { balance: user.leaveBalance?.sick ?? 0, used: used.sick || 0 },
        earned: { balance: user.leaveBalance?.earned ?? 0, used: used.earned || 0 },
        workFromHome: { balance: null, used: used.work_from_home || 0 },
      },
    });
  } catch (error) { next(error); }
};
