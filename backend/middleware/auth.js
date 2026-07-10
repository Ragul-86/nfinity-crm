const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

// ─────────────────────────────────────────
// protect — verify JWT and attach req.user
// ─────────────────────────────────────────
exports.protect = async (req, res, next) => {
  try {
    let token;

    if (req.cookies?.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (user.status === 'deactivated' || user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account has been deactivated or suspended. Contact your administrator.' });
    }

    if (!user.isActive && user.role !== 'platform_super_admin') {
      return res.status(401).json({ success: false, message: 'Account inactive. Contact admin.' });
    }

    req.user = user;

    // ── Tenant scope ──
    // Platform Super Admin has no tenantId — they can access any tenant.
    // For all other users, resolve their tenant and check it's active.
    if (user.role === 'platform_super_admin') {
      // Platform admin can impersonate a tenant via header X-Tenant-Id
      const impersonateTenantId = req.headers['x-tenant-id'];
      if (impersonateTenantId) {
        const tenant = await Tenant.findById(impersonateTenantId);
        if (!tenant) {
          return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        req.tenantId = tenant._id;
        req.tenant = tenant;
        req.isImpersonating = true;
      } else {
        req.tenantId = null;
        req.tenant = null;
        req.isImpersonating = false;
      }
    } else {
      if (!user.tenantId) {
        return res.status(403).json({ success: false, message: 'No workspace assigned to this account.' });
      }

      const tenant = await Tenant.findById(user.tenantId);
      if (!tenant) {
        return res.status(403).json({ success: false, message: 'Workspace not found.' });
      }
      if (tenant.status === 'suspended') {
        return res.status(403).json({ success: false, message: 'Your workspace has been suspended. Contact support.' });
      }
      if (tenant.status === 'deleted') {
        return res.status(403).json({ success: false, message: 'This workspace no longer exists.' });
      }

      req.tenantId = user.tenantId;
      req.tenant = tenant;
      req.isImpersonating = false;
    }

    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

// ─────────────────────────────────────────
// authorize — role-based access control
// ─────────────────────────────────────────
exports.authorize = (...roles) => {
  return (req, res, next) => {
    // platform_super_admin always passes (unless explicitly excluded)
    if (req.user.role === 'platform_super_admin' && !roles.includes('no_platform_admin')) {
      return next();
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied. You do not have permission to perform this action.',
      });
    }
    next();
  };
};

// ─────────────────────────────────────────
// platformOnly — only platform_super_admin
// ─────────────────────────────────────────
exports.platformOnly = (req, res, next) => {
  if (req.user.role !== 'platform_super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Access Denied. Platform administrator access required.',
    });
  }
  next();
};

// ─────────────────────────────────────────
// requireTenant — ensures a tenant scope exists
// Blocks platform admins who aren't impersonating from accessing tenant data
// ─────────────────────────────────────────
exports.requireTenant = (req, res, next) => {
  if (!req.tenantId) {
    return res.status(403).json({
      success: false,
      message: 'No workspace context. Use X-Tenant-Id header to target a workspace.',
    });
  }
  next();
};

// ─────────────────────────────────────────
// getTenantFilter — utility for controllers
// Returns a Mongoose filter fragment scoped to the current tenant
// ─────────────────────────────────────────
exports.getTenantFilter = (req) => {
  if (req.user.role === 'platform_super_admin' && !req.tenantId) {
    return {}; // Platform admin without tenant scope = global view
  }
  return { tenantId: req.tenantId };
};

// ─────────────────────────────────────────
// injectTenantId — utility for create/update
// Single-arg:  injectTenantId(req)         → returns tenantId value
// Two-arg:     injectTenantId(req, data)   → returns { ...data, tenantId }
// ─────────────────────────────────────────
exports.injectTenantId = (req, data) => {
  const tenantId = req.tenantId || null;
  if (data && typeof data === 'object') return { ...data, tenantId };
  return tenantId;
};
