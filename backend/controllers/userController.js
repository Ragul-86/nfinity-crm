const User = require('../models/User');
const Lead = require('../models/Lead');
const Task = require('../models/Task');
const APIFeatures = require('../utils/apiFeatures');
const { getTenantFilter, injectTenantId } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');

// ── GET /api/users ─────────────────────────────────────────────────────────────
exports.getUsers = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const baseFilter = { ...tf, role: { $ne: 'platform_super_admin' } };

    const features = new APIFeatures(
      User.find(baseFilter).populate('invitedBy', 'name email'),
      req.query
    )
      .search(['name', 'email', 'department', 'designation', 'phone'])
      .filter()
      .sort()
      .paginate();

    const [users, total] = await Promise.all([
      features.query.lean(),
      User.countDocuments(baseFilter),
    ]);

    if (users.length === 0) {
      return res.status(200).json({ success: true, count: 0, total, data: [] });
    }

    // Attach assigned lead + task counts
    const userIds = users.map(u => u._id);
    const [leadCounts, taskCounts] = await Promise.all([
      Lead.aggregate([
        { $match: { assignedTo: { $in: userIds }, ...tf } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { assignedTo: { $in: userIds }, status: { $nin: ['completed', 'cancelled'] }, ...tf } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
    ]);

    const leadMap = Object.fromEntries(leadCounts.map(l => [l._id.toString(), l.count]));
    const taskMap = Object.fromEntries(taskCounts.map(t => [t._id.toString(), t.count]));

    const enriched = users.map(u => ({
      ...u,
      assignedLeads: leadMap[u._id.toString()] || 0,
      assignedTasks: taskMap[u._id.toString()] || 0,
    }));

    res.status(200).json({ success: true, count: enriched.length, total, page: features.page, data: enriched });
  } catch (error) { next(error); }
};

// ── GET /api/users/:id ─────────────────────────────────────────────────────────
exports.getUser = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    const user = await User.findOne({ _id: req.params.id, ...tf })
      .populate('invitedBy', 'name email')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Enrich with counts
    const [assignedLeads, assignedTasks] = await Promise.all([
      Lead.countDocuments({ assignedTo: user._id, ...tf }),
      Task.countDocuments({ assignedTo: user._id, status: { $nin: ['completed', 'cancelled'] }, ...tf }),
    ]);

    res.status(200).json({ success: true, data: { ...user, assignedLeads, assignedTasks } });
  } catch (error) { next(error); }
};

// ── POST /api/users ─────────────────────────────────────────────────────────────
exports.createUser = async (req, res, next) => {
  try {
    const user = await User.create({ ...req.body, tenantId: injectTenantId(req) });
    await logAction({
      action: 'user_created',
      performedBy: req.user._id,
      targetUser: user._id,
      tenantId: req.tenantId,
      details: { name: user.name, email: user.email, role: user.role },
      req,
    });
    res.status(201).json({ success: true, data: user });
  } catch (error) { next(error); }
};

// ── PUT /api/users/:id ─────────────────────────────────────────────────────────
// Updates allowed fields. Password is excluded here — use PATCH /:id/reset-password.
exports.updateUser = async (req, res, next) => {
  try {
    const { password, role, status, tenantId: _tid, ...rest } = req.body;
    const tf = getTenantFilter(req);

    // Only super_admin may change role/status via this endpoint
    const update = { ...rest };
    const isSuperAdmin = ['super_admin', 'client_super_admin'].includes(req.user.role);
    if (isSuperAdmin && role !== undefined) update.role = role;
    if (isSuperAdmin && status !== undefined) update.status = status;

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...tf },
      update,
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await logAction({
      action: 'user_updated',
      performedBy: req.user._id,
      targetUser: user._id,
      tenantId: req.tenantId,
      details: { fields: Object.keys(rest) },
      req,
    });
    res.status(200).json({ success: true, data: user });
  } catch (error) { next(error); }
};

// ── DELETE /api/users/:id ──────────────────────────────────────────────────────
exports.deleteUser = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req);
    await User.findOneAndUpdate(
      { _id: req.params.id, ...tf },
      { isActive: false, status: 'deactivated' }
    );
    await logAction({
      action: 'user_deactivated',
      performedBy: req.user._id,
      targetUser: req.params.id,
      tenantId: req.tenantId,
      req,
    });
    res.status(200).json({ success: true, message: 'User deactivated' });
  } catch (error) { next(error); }
};

// ── PATCH /api/users/:id/status ────────────────────────────────────────────────
exports.updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['active', 'inactive', 'deactivated', 'suspended'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }
    const isActive = status === 'active';
    const tf = getTenantFilter(req);
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...tf },
      { isActive, status },
      { new: true, runValidators: false }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const actionMap = {
      active:      'user_activated',
      deactivated: 'user_deactivated',
      suspended:   'user_suspended',
      inactive:    'status_changed',
    };
    await logAction({
      action: actionMap[status] || 'status_changed',
      performedBy: req.user._id,
      targetUser: user._id,
      tenantId: req.tenantId,
      details: { previousStatus: user.status, newStatus: status },
      req,
    });
    res.status(200).json({ success: true, data: user });
  } catch (error) { next(error); }
};

// ── PATCH /api/users/:id/change-role ──────────────────────────────────────────
exports.changeRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const allowedRoles = ['admin', 'manager', 'employee', 'viewer'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role. Allowed: admin, manager, employee, viewer' });
    }

    const tf = getTenantFilter(req);
    const target = await User.findOne({ _id: req.params.id, ...tf });
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    // Prevent escalating to super_admin via this endpoint
    if (['super_admin', 'client_super_admin', 'platform_super_admin'].includes(target.role)) {
      return res.status(403).json({ success: false, message: 'Cannot change role of a workspace super admin' });
    }

    const previousRole = target.role;
    target.role = role;
    await target.save();

    await logAction({
      action: 'role_changed',
      performedBy: req.user._id,
      targetUser: target._id,
      tenantId: req.tenantId,
      details: { previousRole, newRole: role, userName: target.name },
      req,
    });
    res.status(200).json({ success: true, data: target, message: `Role updated to ${role}` });
  } catch (error) { next(error); }
};

// ── PATCH /api/users/:id/reset-password ───────────────────────────────────────
// Admin-initiated password reset (sets a new password on behalf of user)
exports.resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    const tf = getTenantFilter(req);
    const user = await User.findOne({ _id: req.params.id, ...tf }).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.password = password;
    await user.save();

    await logAction({
      action: 'password_reset',
      performedBy: req.user._id,
      targetUser: user._id,
      tenantId: req.tenantId,
      details: { adminReset: true, targetEmail: user.email },
      req,
    });
    res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error) { next(error); }
};

// ── PUT /api/users/upload-avatar ───────────────────────────────────────────────
exports.updateAvatar = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const avatarUrl = `/uploads/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(req.user.id, { avatar: avatarUrl }, { new: true });
    res.status(200).json({ success: true, data: user });
  } catch (error) { next(error); }
};
