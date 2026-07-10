const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { toCSV, toExcelHTML, buildSimplePDF } = require('../utils/exportUtils');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');

const WORK_START_HOUR = 9;
const STANDARD_HOURS = 8;

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

// ============ Daily Attendance: clock in/out + breaks ============

exports.clockIn = async (req, res, next) => {
  try {
    const today = startOfDay(new Date());
    const tenantId = injectTenantId(req);
    const existing = await Attendance.findOne({ employee: req.user.id, date: today, ...(tenantId ? { tenantId } : {}) });
    if (existing?.clockIn) return res.status(400).json({ success: false, message: 'Already clocked in today' });
    const now = new Date();
    const isLate = now.getHours() > WORK_START_HOUR || (now.getHours() === WORK_START_HOUR && now.getMinutes() > 0);
    const lateMinutes = isLate ? (now.getHours() - WORK_START_HOUR) * 60 + now.getMinutes() : 0;
    const isWFH = !!req.body.workFromHome;
    const status = isWFH ? 'work_from_home' : (isLate ? 'late' : 'present');
    const payload = { clockIn: now, isLate, lateMinutes, status, department: req.user.department || '' };
    const attendance = existing
      ? await Attendance.findByIdAndUpdate(existing._id, payload, { new: true })
      : await Attendance.create({ employee: req.user.id, date: today, ...payload, tenantId });
    res.status(200).json({ success: true, data: attendance });
  } catch (error) { next(error); }
};

exports.clockOut = async (req, res, next) => {
  try {
    const today = startOfDay(new Date());
    const tenantId = injectTenantId(req);
    const attendance = await Attendance.findOne({ employee: req.user.id, date: today, ...(tenantId ? { tenantId } : {}) });
    if (!attendance?.clockIn) return res.status(400).json({ success: false, message: 'Not clocked in today' });
    const now = new Date();
    let totalBreakMinutes = attendance.totalBreakMinutes || 0;
    const breaks = attendance.breaks || [];
    if (breaks.length && breaks[breaks.length - 1].start && !breaks[breaks.length - 1].end) {
      breaks[breaks.length - 1].end = now;
      totalBreakMinutes += Math.round((now - breaks[breaks.length - 1].start) / 60000);
    }
    const grossHours = (now - attendance.clockIn) / (1000 * 60 * 60);
    const netHours = Math.max(0, grossHours - totalBreakMinutes / 60);
    const overtimeHours = netHours > STANDARD_HOURS ? parseFloat((netHours - STANDARD_HOURS).toFixed(2)) : 0;
    const status = netHours < 4 ? 'half_day' : attendance.status;
    const updated = await Attendance.findByIdAndUpdate(attendance._id, {
      clockOut: now, breaks, totalBreakMinutes,
      hoursWorked: parseFloat(netHours.toFixed(2)), overtimeHours, status,
    }, { new: true });
    res.status(200).json({ success: true, data: updated });
  } catch (error) { next(error); }
};

exports.breakStart = async (req, res, next) => {
  try {
    const today = startOfDay(new Date());
    const tenantId = injectTenantId(req);
    const attendance = await Attendance.findOne({ employee: req.user.id, date: today, ...(tenantId ? { tenantId } : {}) });
    if (!attendance?.clockIn) return res.status(400).json({ success: false, message: 'Clock in before starting a break' });
    if (attendance.clockOut) return res.status(400).json({ success: false, message: 'Already clocked out for today' });
    const breaks = attendance.breaks || [];
    if (breaks.length && !breaks[breaks.length - 1].end) {
      return res.status(400).json({ success: false, message: 'Break already in progress' });
    }
    breaks.push({ start: new Date() });
    attendance.breaks = breaks;
    await attendance.save();
    res.status(200).json({ success: true, data: attendance });
  } catch (error) { next(error); }
};

exports.breakEnd = async (req, res, next) => {
  try {
    const today = startOfDay(new Date());
    const tenantId = injectTenantId(req);
    const attendance = await Attendance.findOne({ employee: req.user.id, date: today, ...(tenantId ? { tenantId } : {}) });
    if (!attendance) return res.status(400).json({ success: false, message: 'No attendance record for today' });
    const breaks = attendance.breaks || [];
    if (!breaks.length || breaks[breaks.length - 1].end) {
      return res.status(400).json({ success: false, message: 'No break in progress' });
    }
    const now = new Date();
    breaks[breaks.length - 1].end = now;
    const minutes = Math.round((now - breaks[breaks.length - 1].start) / 60000);
    attendance.breaks = breaks;
    attendance.totalBreakMinutes = (attendance.totalBreakMinutes || 0) + minutes;
    await attendance.save();
    res.status(200).json({ success: true, data: attendance });
  } catch (error) { next(error); }
};

exports.getMyAttendance = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    const records = await Attendance.find({ employee: req.user.id, date: { $gte: start, $lte: end } }).sort({ date: -1 });
    res.status(200).json({ success: true, data: records });
  } catch (error) { next(error); }
};

exports.getAllAttendance = async (req, res, next) => {
  try {
    const { date, month, year, department, status, employee } = req.query;
    const tf = getTenantFilter(req);
    const filter = { ...tf };
    if (date) {
      const d = startOfDay(new Date(date));
      filter.date = { $gte: d, $lte: endOfDay(d) };
    } else {
      const m = parseInt(month) || new Date().getMonth() + 1;
      const y = parseInt(year) || new Date().getFullYear();
      filter.date = { $gte: new Date(y, m - 1, 1), $lte: new Date(y, m, 0, 23, 59, 59, 999) };
    }
    if (department) filter.department = department;
    if (status) filter.status = status;
    if (employee) filter.employee = employee;
    const records = await Attendance.find(filter).populate('employee', 'name email avatar department').sort({ date: -1 });
    res.status(200).json({ success: true, data: records });
  } catch (error) { next(error); }
};

exports.getTodayStatus = async (req, res, next) => {
  try {
    const today = startOfDay(new Date());
    const attendance = await Attendance.findOne({ employee: req.user.id, date: today });
    res.status(200).json({ success: true, data: attendance });
  } catch (error) { next(error); }
};

// ============ Manual record management (admin/manager) ============

exports.markAttendance = async (req, res, next) => {
  try {
    const { employee, date, status, clockIn, clockOut, notes } = req.body;
    if (!employee || !date || !status) {
      return res.status(400).json({ success: false, message: 'employee, date and status are required' });
    }
    const day = startOfDay(new Date(date));
    const tf = getTenantFilter(req);
    const emp = await User.findOne({ _id: employee, ...tf });
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
    const update = { status, notes: notes || '', department: emp.department || '' };
    if (clockIn) update.clockIn = new Date(clockIn);
    if (clockOut) update.clockOut = new Date(clockOut);
    const tenantId = injectTenantId(req);
    const record = await Attendance.findOneAndUpdate(
      { employee, date: day, ...(tenantId ? { tenantId } : {}) },
      { $set: update, $setOnInsert: { employee, date: day, tenantId } },
      { upsert: true, new: true }
    ).populate('employee', 'name email avatar department');
    res.status(200).json({ success: true, data: record });
  } catch (error) { next(error); }
};

exports.deleteAttendance = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const record = await Attendance.findOneAndDelete({ _id: req.params.id, ...tf });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    res.status(200).json({ success: true, data: {} });
  } catch (error) { next(error); }
};

// ============ Dashboard widgets ============

exports.getDashboardStats = async (req, res, next) => {
  try {
    const today = startOfDay(new Date());
    const tf = getTenantFilter(req);
    const totalEmployees = await User.countDocuments({ isActive: true, role: { $ne: 'platform_super_admin' }, ...tf });
    const todaysRecords = await Attendance.find({ date: today, ...tf });
    const presentToday = todaysRecords.filter(r => ['present', 'late', 'half_day', 'work_from_home'].includes(r.status)).length;
    const onLeaveToday = todaysRecords.filter(r => r.status === 'leave').length;
    const lateCheckins = todaysRecords.filter(r => r.isLate).length;
    const absentToday = Math.max(0, totalEmployees - presentToday - onLeaveToday);
    const attendanceRate = totalEmployees > 0 ? Math.round((presentToday / totalEmployees) * 100) : 0;
    res.status(200).json({
      success: true,
      data: { totalEmployees, presentToday, absentToday, lateCheckins, onLeaveToday, attendanceRate },
    });
  } catch (error) { next(error); }
};

exports.getTrend = async (req, res, next) => {
  try {
    const days = Math.min(60, parseInt(req.query.days) || 14);
    const tf = getTenantFilter(req);
    const totalEmployees = await User.countDocuments({ isActive: true, role: { $ne: 'platform_super_admin' }, ...tf });
    const start = startOfDay(new Date(Date.now() - (days - 1) * 86400000));
    const end = endOfDay(new Date());
    const records = await Attendance.find({ date: { $gte: start, $lte: end }, ...tf });
    const byDate = {};
    records.forEach(r => {
      const key = startOfDay(r.date).toISOString().slice(0, 10);
      if (!byDate[key]) byDate[key] = { present: 0, late: 0, leave: 0 };
      if (['present', 'half_day', 'work_from_home', 'late'].includes(r.status)) byDate[key].present += 1;
      if (r.isLate) byDate[key].late += 1;
      if (r.status === 'leave') byDate[key].leave += 1;
    });
    const trend = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const bucket = byDate[key] || { present: 0, late: 0, leave: 0 };
      trend.push({
        date: key,
        present: bucket.present, late: bucket.late, onLeave: bucket.leave,
        absent: Math.max(0, totalEmployees - bucket.present - bucket.leave),
      });
    }
    res.status(200).json({ success: true, data: trend });
  } catch (error) { next(error); }
};

exports.getDepartmentWise = async (req, res, next) => {
  try {
    const date = req.query.date ? startOfDay(new Date(req.query.date)) : startOfDay(new Date());
    const tf = getTenantFilter(req);
    const activeUsers = await User.find({ isActive: true, role: { $ne: 'platform_super_admin' }, ...tf }, 'department');
    const deptTotals = {};
    activeUsers.forEach(u => {
      const dept = u.department || 'Unassigned';
      deptTotals[dept] = (deptTotals[dept] || 0) + 1;
    });
    const records = await Attendance.find({ date, ...tf }).populate('employee', 'department');
    const deptPresent = {};
    records.forEach(r => {
      const dept = r.department || r.employee?.department || 'Unassigned';
      if (!deptPresent[dept]) deptPresent[dept] = { present: 0, leave: 0 };
      if (['present', 'half_day', 'work_from_home', 'late'].includes(r.status)) deptPresent[dept].present += 1;
      else if (r.status === 'leave') deptPresent[dept].leave += 1;
    });
    const result = Object.keys(deptTotals).map(dept => {
      const p = deptPresent[dept] || { present: 0, leave: 0 };
      const total = deptTotals[dept];
      const absent = Math.max(0, total - p.present - p.leave);
      return { department: dept, total, present: p.present, onLeave: p.leave, absent, rate: total ? Math.round((p.present / total) * 100) : 0 };
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
};

exports.getMonthlyOverview = async (req, res, next) => {
  try {
    const m = parseInt(req.query.month) || new Date().getMonth() + 1;
    const y = parseInt(req.query.year) || new Date().getFullYear();
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    const tf = getTenantFilter(req);
    const totalEmployees = await User.countDocuments({ isActive: true, role: { $ne: 'platform_super_admin' }, ...tf });
    const records = await Attendance.find({ date: { $gte: start, $lte: end }, ...tf });
    const daysInMonth = end.getDate();
    const overview = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const key = new Date(y, m - 1, day).toISOString().slice(0, 10);
      const dayRecords = records.filter(r => startOfDay(r.date).toISOString().slice(0, 10) === key);
      const present = dayRecords.filter(r => ['present', 'half_day', 'work_from_home', 'late'].includes(r.status)).length;
      const late = dayRecords.filter(r => r.isLate).length;
      const onLeave = dayRecords.filter(r => r.status === 'leave').length;
      overview.push({ date: key, present, late, onLeave, absent: Math.max(0, totalEmployees - present - onLeave) });
    }
    res.status(200).json({ success: true, data: overview });
  } catch (error) { next(error); }
};

// ============ Reports + Export ============

async function fetchReportRows(query, tf) {
  const { type = 'monthly', date, month, year, employee } = query;
  const filter = { ...tf };
  if (employee) filter.employee = employee;

  if (type === 'daily') {
    const d = startOfDay(new Date(date || new Date()));
    filter.date = { $gte: d, $lte: endOfDay(d) };
  } else if (type === 'weekly') {
    const ref = date ? new Date(date) : new Date();
    const dow = ref.getDay();
    const monday = new Date(ref);
    monday.setDate(ref.getDate() - ((dow + 6) % 7));
    const start = startOfDay(monday);
    const sunday = new Date(start);
    sunday.setDate(start.getDate() + 6);
    filter.date = { $gte: start, $lte: endOfDay(sunday) };
  } else {
    const mNum = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();
    filter.date = { $gte: new Date(y, mNum - 1, 1), $lte: new Date(y, mNum, 0, 23, 59, 59, 999) };
  }

  const records = await Attendance.find(filter).populate('employee', 'name email department').sort({ date: 1 });
  return records.map(r => ({
    employeeName: r.employee?.name || 'Unknown',
    employeeId: r.employee ? 'EMP' + r.employee._id.toString().slice(-6).toUpperCase() : '',
    department: r.department || r.employee?.department || '',
    date: r.date ? r.date.toISOString().slice(0, 10) : '',
    checkIn: r.clockIn ? new Date(r.clockIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-',
    checkOut: r.clockOut ? new Date(r.clockOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-',
    hoursWorked: r.hoursWorked || 0,
    overtimeHours: r.overtimeHours || 0,
    status: r.status,
    remarks: r.notes || '',
  }));
}

const REPORT_COLUMNS = [
  { key: 'employeeName', label: 'Employee Name' },
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'department', label: 'Department' },
  { key: 'date', label: 'Date' },
  { key: 'checkIn', label: 'Check-In' },
  { key: 'checkOut', label: 'Check-Out' },
  { key: 'hoursWorked', label: 'Working Hours' },
  { key: 'overtimeHours', label: 'Overtime' },
  { key: 'status', label: 'Status' },
  { key: 'remarks', label: 'Remarks' },
];

exports.getReport = async (req, res, next) => {
  try {
    const rows = await fetchReportRows(req.query, getTenantFilter(req));
    res.status(200).json({ success: true, data: rows, count: rows.length });
  } catch (error) { next(error); }
};

exports.exportReport = async (req, res, next) => {
  try {
    const rows = await fetchReportRows(req.query, getTenantFilter(req));
    const format = (req.query.format || 'csv').toLowerCase();
    const type = req.query.type || 'monthly';
    const filenameBase = `attendance-${type}-report-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'excel') {
      const html = toExcelHTML('Attendance Report', REPORT_COLUMNS, rows);
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xls"`);
      return res.status(200).send(html);
    }
    if (format === 'pdf') {
      const pdf = buildSimplePDF('Attendance Report', REPORT_COLUMNS, rows);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);
      return res.status(200).send(pdf);
    }
    const csv = toCSV(REPORT_COLUMNS, rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
    return res.status(200).send(csv);
  } catch (error) { next(error); }
};
