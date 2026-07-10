const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  department: { type: String, default: '' },
  date: { type: Date, required: true },
  clockIn: Date,
  clockOut: Date,
  breaks: [{
    start: Date,
    end: Date,
  }],
  totalBreakMinutes: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'half_day', 'leave', 'work_from_home'],
    default: 'present',
  },
  hoursWorked: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  isLate: { type: Boolean, default: false },
  lateMinutes: { type: Number, default: 0 },
  leaveType: { type: String, enum: ['sick', 'casual', 'earned', 'work_from_home', 'annual', 'unpaid', ''], default: '' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true });

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
