const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, minlength: 6, select: false },
  role: {
    type: String,
    enum: ['platform_super_admin', 'client_super_admin', 'super_admin', 'admin', 'manager', 'employee', 'viewer'],
    default: 'employee',
  },

  // Multi-tenancy — null for platform_super_admin
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true, default: null },

  // Extended user status (replaces simple isActive boolean for multi-tenant)
  status: {
    type: String,
    enum: ['active', 'inactive', 'deactivated', 'pending_invitation', 'suspended'],
    default: 'active',
    index: true,
  },

  avatar: { type: String, default: '' },
  phone: { type: String, default: '' },
  department: { type: String, default: '' },
  designation: { type: String, default: '' },

  // Keep isActive for backward compat — derived from status
  isActive: { type: Boolean, default: true },

  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: String,
  emailVerificationExpire: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  lastLogin: Date,

  // Invitation tracking
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  invitationAcceptedAt: Date,

  permissions: {
    type: Map,
    of: [String],
    default: {},
  },
  notificationPreferences: {
    email: { type: Boolean, default: true },
    inApp: { type: Boolean, default: true },
    taskReminders: { type: Boolean, default: true },
    campaignAlerts: { type: Boolean, default: true },
    sopApprovals: { type: Boolean, default: true },
  },
  theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
  rememberMe: { type: Boolean, default: false },
  leaveBalance: {
    casual: { type: Number, default: 12 },
    sick: { type: Number, default: 12 },
    earned: { type: Number, default: 15 },
  },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

userSchema.virtual('employeeId').get(function () {
  return 'EMP' + this._id.toString().slice(-6).toUpperCase();
});

// Keep isActive in sync with status
userSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.isActive = this.status === 'active';
  } else if (this.isModified('isActive')) {
    this.status = this.isActive ? 'active' : 'inactive';
  }
  next();
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if this user is a platform-level admin
userSchema.methods.isPlatformAdmin = function () {
  return this.role === 'platform_super_admin';
};

// Check if this user is a tenant-level super admin
userSchema.methods.isTenantSuperAdmin = function () {
  return this.role === 'super_admin' || this.role === 'client_super_admin';
};

module.exports = mongoose.model('User', userSchema);
