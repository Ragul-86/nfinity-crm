const AuditLog = require('../models/AuditLog');

/**
 * Log a team/user access action to the audit log.
 * All fields are optional except action + performedBy.
 * Failures are swallowed (never crash the request).
 */
exports.logAction = async ({
  action,
  module: auditModule,
  performedBy,
  targetUser,
  tenantId,
  details = {},
  resourceId,
  resourceType,
  req,
}) => {
  try {
    await AuditLog.create({
      action,
      module: auditModule || 'team',
      performedBy,
      targetUser: targetUser || undefined,
      tenantId: tenantId || undefined,
      details,
      resourceId: resourceId || undefined,
      resourceType: resourceType || 'user',
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    });
  } catch (e) {
    // Audit log failures must never break the main request
    console.error('[AuditLog] Failed to write:', e.message);
  }
};
