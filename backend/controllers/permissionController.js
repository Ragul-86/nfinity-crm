const { Permission, DEFAULT_PERMISSIONS } = require('../models/Permission');
const { logAction } = require('../utils/auditLogger');

// ── GET /api/permissions/:role ─────────────────────────────────────────────────
// Returns effective permissions for a role in the current tenant.
// Merges stored overrides onto the default matrix.
exports.getPermissions = async (req, res, next) => {
  try {
    const { role } = req.params;
    const tenantId = req.tenantId;

    const defaults = DEFAULT_PERMISSIONS[role];
    if (!defaults) {
      return res.status(400).json({ success: false, message: `No defaults for role: ${role}` });
    }

    // Load tenant overrides if any
    const stored = tenantId
      ? await Permission.findOne({ tenantId, role }).lean()
      : null;

    // Deep merge: stored overrides win, defaults fill gaps
    const modules = {};
    for (const [mod, defaultActions] of Object.entries(defaults)) {
      modules[mod] = { ...defaultActions, ...(stored?.modules?.[mod] || {}) };
    }

    res.status(200).json({ success: true, data: { role, tenantId, modules } });
  } catch (error) { next(error); }
};

// ── GET /api/permissions ───────────────────────────────────────────────────────
// Returns all roles' permissions for the current tenant
exports.getAllPermissions = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const roles = ['admin', 'manager', 'employee', 'viewer'];

    const stored = tenantId
      ? await Permission.find({ tenantId }).lean()
      : [];
    const storedMap = Object.fromEntries(stored.map(p => [p.role, p]));

    const result = {};
    for (const role of roles) {
      const defaults = DEFAULT_PERMISSIONS[role] || {};
      const storedRole = storedMap[role];
      const modules = {};
      for (const [mod, defaultActions] of Object.entries(defaults)) {
        modules[mod] = { ...defaultActions, ...(storedRole?.modules?.[mod] || {}) };
      }
      result[role] = modules;
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
};

// ── PUT /api/permissions/:role ─────────────────────────────────────────────────
// Client Super Admin updates permission overrides for a role in their tenant.
exports.updatePermissions = async (req, res, next) => {
  try {
    const { role } = req.params;
    const { modules } = req.body;
    const tenantId = req.tenantId;

    const editableRoles = ['admin', 'manager', 'employee', 'viewer'];
    if (!editableRoles.includes(role)) {
      return res.status(403).json({ success: false, message: 'Cannot modify permissions for this role' });
    }
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'No tenant context' });
    }

    const updated = await Permission.findOneAndUpdate(
      { tenantId, role },
      { $set: { modules } },
      { upsert: true, new: true, runValidators: true }
    );

    await logAction({
      action: 'permission_changed',
      performedBy: req.user._id,
      tenantId,
      details: { role, modules },
      req,
    });

    res.status(200).json({ success: true, data: updated });
  } catch (error) { next(error); }
};

// ── POST /api/permissions/reset/:role ─────────────────────────────────────────
// Reset a role's permissions back to system defaults
exports.resetPermissions = async (req, res, next) => {
  try {
    const { role } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'No tenant context' });

    await Permission.deleteOne({ tenantId, role });

    await logAction({
      action: 'permission_changed',
      performedBy: req.user._id,
      tenantId,
      details: { role, resetToDefault: true },
      req,
    });

    res.status(200).json({ success: true, message: `Permissions for ${role} reset to defaults` });
  } catch (error) { next(error); }
};
