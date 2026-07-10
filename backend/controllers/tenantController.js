const crypto = require('crypto');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Client = require('../models/Client');
const Campaign = require('../models/Campaign');
const Task = require('../models/Task');
const { sendTokenResponse } = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');

// ── GET /api/platform/tenants — list all workspaces
exports.listTenants = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [tenants, total] = await Promise.all([
      Tenant.find(filter)
        .populate('owner', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Tenant.countDocuments(filter),
    ]);

    // Attach user counts
    const tenantIds = tenants.map(t => t._id);
    const userCounts = await User.aggregate([
      { $match: { tenantId: { $in: tenantIds }, role: { $ne: 'platform_super_admin' } } },
      { $group: { _id: '$tenantId', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    userCounts.forEach(u => { countMap[u._id.toString()] = u.count; });

    const result = tenants.map(t => ({
      ...t.toObject(),
      userCount: countMap[t._id.toString()] || 0,
    }));

    res.status(200).json({ success: true, total, page: Number(page), tenants: result });
  } catch (error) { next(error); }
};

// ── GET /api/platform/tenants/:id — get single workspace
exports.getTenant = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id).populate('owner', 'name email role');
    if (!tenant) return res.status(404).json({ success: false, message: 'Workspace not found' });

    const users = await User.find({ tenantId: tenant._id, role: { $ne: 'platform_super_admin' } })
      .select('name email role status isActive lastLogin createdAt')
      .sort({ createdAt: 1 });

    res.status(200).json({ success: true, data: { ...tenant.toObject(), users } });
  } catch (error) { next(error); }
};

// ── POST /api/platform/tenants — create new workspace
exports.createTenant = async (req, res, next) => {
  try {
    const { name, slug, plan, adminName, adminEmail, adminPassword, company } = req.body;

    if (!name || !adminName || !adminEmail) {
      return res.status(400).json({ success: false, message: 'Workspace name, admin name, and admin email are required' });
    }

    // Check for duplicate email
    const existingUser = await User.findOne({ email: adminEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Generate slug
    const baseSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let finalSlug = baseSlug;
    let count = 0;
    while (await Tenant.findOne({ slug: finalSlug })) {
      count++;
      finalSlug = `${baseSlug}-${count}`;
    }

    // Create workspace
    const tenant = await Tenant.create({
      name,
      slug: finalSlug,
      plan: plan || 'trial',
      company: company || {},
      createdBy: req.user._id,
    });

    // Create the Client Super Admin user
    const superAdmin = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword || crypto.randomBytes(10).toString('hex'),
      role: 'super_admin',
      tenantId: tenant._id,
      status: adminPassword ? 'active' : 'pending_invitation',
      isActive: !!adminPassword,
      invitedBy: req.user._id,
    });

    // Link owner back to tenant
    tenant.owner = superAdmin._id;
    await tenant.save();

    // If no password was provided, send a setup email
    if (!adminPassword) {
      try {
        const setupToken = crypto.randomBytes(32).toString('hex');
        superAdmin.resetPasswordToken = crypto.createHash('sha256').update(setupToken).digest('hex');
        superAdmin.resetPasswordExpire = Date.now() + 72 * 60 * 60 * 1000; // 72h
        await superAdmin.save({ validateBeforeSave: false });

        const setupUrl = `${process.env.CLIENT_URL}/accept-invitation/${setupToken}`;
        await sendEmail({
          to: adminEmail,
          subject: `You've been added to ${name} — Set up your account`,
          html: `
            <h2>Welcome to ${name}</h2>
            <p>Hi ${adminName},</p>
            <p>A workspace has been created for your company on the TEAM UPDATE CRM.</p>
            <p>Click the link below to set your password and get started:</p>
            <p><a href="${setupUrl}" style="background:#4f46e5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">Set Up My Account</a></p>
            <p>This link expires in 72 hours.</p>
          `,
        });
      } catch (e) {
        console.error('Setup email failed:', e.message);
      }
    }

    res.status(201).json({
      success: true,
      message: `Workspace "${name}" created successfully`,
      tenant: { _id: tenant._id, name: tenant.name, slug: tenant.slug, plan: tenant.plan, status: tenant.status },
      superAdmin: { _id: superAdmin._id, name: superAdmin.name, email: superAdmin.email },
    });
  } catch (error) { next(error); }
};

// ── PATCH /api/platform/tenants/:id/status — activate/suspend/delete
exports.updateTenantStatus = async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    const validStatuses = ['active', 'suspended', 'deleted'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, message: 'Workspace not found' });

    tenant.status = status;
    if (status === 'suspended') {
      tenant.suspendedAt = new Date();
      tenant.suspendedBy = req.user._id;
      tenant.suspendReason = reason || '';
    }
    if (status === 'deleted') {
      tenant.deletedAt = new Date();
      tenant.deletedBy = req.user._id;
    }
    await tenant.save();

    res.status(200).json({ success: true, message: `Workspace ${status}`, tenant });
  } catch (error) { next(error); }
};

// ── PUT /api/platform/tenants/:id — update workspace details
exports.updateTenant = async (req, res, next) => {
  try {
    const { name, plan, company, adminNotes, subscription } = req.body;
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { name, plan, company, adminNotes, subscription },
      { new: true, runValidators: true }
    );
    if (!tenant) return res.status(404).json({ success: false, message: 'Workspace not found' });
    res.status(200).json({ success: true, data: tenant });
  } catch (error) { next(error); }
};

// ── POST /api/platform/tenants/:id/impersonate — get a short-lived impersonation token
exports.impersonate = async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, message: 'Workspace not found' });
    if (tenant.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot impersonate a suspended or deleted workspace' });
    }

    // Find the tenant's super admin
    const superAdmin = await User.findOne({
      tenantId: tenant._id,
      role: { $in: ['super_admin', 'client_super_admin'] },
      status: 'active',
    });

    if (!superAdmin) {
      return res.status(404).json({ success: false, message: 'No active super admin found in this workspace' });
    }

    // Issue a short-lived impersonation token (1 hour)
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: req.user._id, impersonatingTenantId: tenant._id.toString(), impersonatedAdminId: superAdmin._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      success: true,
      message: `Impersonating workspace: ${tenant.name}`,
      token,
      tenant: { _id: tenant._id, name: tenant.name, slug: tenant.slug },
      user: { _id: superAdmin._id, name: superAdmin.name, email: superAdmin.email, role: superAdmin.role },
    });
  } catch (error) { next(error); }
};

// ── GET /api/platform/stats — global platform analytics
exports.getPlatformStats = async (req, res, next) => {
  try {
    const [
      totalTenants, activeTenants, suspendedTenants, trialTenants,
      totalUsers, totalLeads, totalClients, activeCampaigns, openTasks,
    ] = await Promise.all([
      Tenant.countDocuments({ status: { $ne: 'deleted' } }),
      Tenant.countDocuments({ status: 'active' }),
      Tenant.countDocuments({ status: 'suspended' }),
      Tenant.countDocuments({ plan: 'trial' }),
      User.countDocuments({ role: { $ne: 'platform_super_admin' } }),
      Lead.countDocuments({}),
      Client.countDocuments({}),
      Campaign.countDocuments({ status: 'active' }),
      Task.countDocuments({ status: { $nin: ['completed', 'cancelled'] } }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalTenants, activeTenants, suspendedTenants, trialTenants,
        totalUsers, totalLeads, totalClients, activeCampaigns, openTasks,
      },
    });
  } catch (error) { next(error); }
};
