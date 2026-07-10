const mongoose = require('mongoose');

const AUDIT_ACTIONS = [
  'user_invited', 'user_created', 'user_updated',
  'role_changed', 'status_changed', 'user_deactivated',
  'user_suspended', 'user_activated', 'invite_resent',
  'password_reset', 'access_removed', 'user_impersonated',
  'permission_changed', 'login', 'logout',
];

const auditLogSchema = new mongoose.Schema({
  action:      { type: String, required: true },
  module:      { type: String, default: 'team' },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetUser:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  resourceId:  String,
  resourceType: String,
  details:     { type: mongoose.Schema.Types.Mixed },
  ipAddress:   String,
  userAgent:   String,
}, { timestamps: true });

auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ performedBy: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
