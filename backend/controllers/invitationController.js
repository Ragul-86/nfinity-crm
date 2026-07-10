const crypto = require('crypto');
const Invitation = require('../models/Invitation');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const sendEmail = require('../utils/sendEmail');
const { sendTokenResponse } = require('../utils/generateToken');

// ── POST /api/invitations — send invitation
exports.sendInvitation = async (req, res, next) => {
  try {
    const { email, name, role } = req.body;
    const tenantId = req.user.tenantId;
    const tenant = req.tenant;

    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const allowedRoles = ['admin', 'manager', 'employee', 'viewer'];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role. Only admin, manager, employee, or viewer can be invited.' });
    }

    // Check if user already exists in this tenant
    const existingUser = await User.findOne({ email, tenantId });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists in your workspace.' });
    }

    // Revoke any previous pending invitations for this email in this tenant
    await Invitation.updateMany(
      { email, tenantId, status: 'pending' },
      { status: 'revoked' }
    );

    // Generate token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invitation = await Invitation.create({
      email,
      name: name || '',
      tenantId,
      invitedBy: req.user._id,
      role: role || 'employee',
      token: rawToken,
      tokenHash,
    });

    // Send email
    try {
      const inviteUrl = `${process.env.CLIENT_URL}/accept-invitation/${rawToken}`;
      await sendEmail({
        to: email,
        subject: `You're invited to join ${tenant.name} on TEAM UPDATE CRM`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
            <h2 style="color:#4f46e5">You've been invited!</h2>
            <p>Hi ${name || 'there'},</p>
            <p><strong>${req.user.name}</strong> has invited you to join <strong>${tenant.name}</strong> on TEAM UPDATE CRM as a <strong>${role || 'employee'}</strong>.</p>
            <p>Click the button below to accept your invitation and set up your account:</p>
            <p style="margin:24px 0">
              <a href="${inviteUrl}" style="background:#4f46e5;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Accept Invitation</a>
            </p>
            <p style="color:#64748b;font-size:13px">This invitation expires in 7 days. If you didn't expect this invitation, you can ignore this email.</p>
          </div>
        `,
      });
    } catch (e) {
      console.error('Invitation email failed:', e.message);
    }

    res.status(201).json({
      success: true,
      message: `Invitation sent to ${email}`,
      data: {
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) { next(error); }
};

// ── GET /api/invitations — list invitations for current tenant
exports.listInvitations = async (req, res, next) => {
  try {
    const invitations = await Invitation.find({ tenantId: req.user.tenantId })
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(100);

    // Mark expired ones
    const now = new Date();
    const updates = [];
    invitations.forEach(inv => {
      if (inv.status === 'pending' && inv.expiresAt < now) {
        inv.status = 'expired';
        updates.push(inv.save());
      }
    });
    if (updates.length) await Promise.all(updates);

    res.status(200).json({ success: true, data: invitations });
  } catch (error) { next(error); }
};

// ── GET /api/invitations/validate/:token — validate invitation token (public)
exports.validateInvitation = async (req, res, next) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const invitation = await Invitation.findOne({ tokenHash, status: 'pending' })
      .populate('tenantId', 'name slug');

    if (!invitation) {
      return res.status(400).json({ success: false, message: 'Invitation not found or already used' });
    }
    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      await invitation.save();
      return res.status(400).json({ success: false, message: 'Invitation has expired. Ask your administrator to resend it.' });
    }

    res.status(200).json({
      success: true,
      data: {
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        tenantName: invitation.tenantId?.name,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) { next(error); }
};

// ── POST /api/invitations/accept/:token — accept invitation and set password
exports.acceptInvitation = async (req, res, next) => {
  try {
    const { name, password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const invitation = await Invitation.findOne({ tokenHash, status: 'pending' })
      .populate('tenantId');

    if (!invitation) {
      return res.status(400).json({ success: false, message: 'Invalid or already used invitation' });
    }
    if (invitation.expiresAt < new Date()) {
      invitation.status = 'expired';
      await invitation.save();
      return res.status(400).json({ success: false, message: 'Invitation has expired' });
    }

    const tenant = invitation.tenantId;
    if (!tenant || tenant.status !== 'active') {
      return res.status(403).json({ success: false, message: 'This workspace is not active.' });
    }

    // Check if user already exists (edge case: email registered elsewhere)
    let user = await User.findOne({ email: invitation.email, tenantId: tenant._id });
    if (user) {
      // User was pre-created in pending state (platform admin flow)
      user.name = name || invitation.name || user.name;
      user.password = password;
      user.status = 'active';
      user.isActive = true;
      user.invitationAcceptedAt = new Date();
      user.invitedBy = invitation.invitedBy;
      user.role = invitation.role;
      await user.save();
    } else {
      user = await User.create({
        name: name || invitation.name || invitation.email.split('@')[0],
        email: invitation.email,
        password,
        role: invitation.role,
        tenantId: tenant._id,
        status: 'active',
        isActive: true,
        isEmailVerified: true,
        invitedBy: invitation.invitedBy,
        invitationAcceptedAt: new Date(),
      });
    }

    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();
    invitation.acceptedBy = user._id;
    await invitation.save();

    sendTokenResponse(user, 200, res);
  } catch (error) { next(error); }
};

// ── POST /api/invitations/:id/resend — resend invitation
exports.resendInvitation = async (req, res, next) => {
  try {
    const invitation = await Invitation.findOne({
      _id: req.params.id,
      tenantId: req.user.tenantId,
    }).populate('tenantId', 'name');

    if (!invitation) return res.status(404).json({ success: false, message: 'Invitation not found' });

    if (['accepted', 'revoked'].includes(invitation.status)) {
      return res.status(400).json({ success: false, message: 'Cannot resend an accepted or revoked invitation' });
    }

    // Refresh token and expiry
    const rawToken = crypto.randomBytes(32).toString('hex');
    invitation.token = rawToken;
    invitation.tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    invitation.status = 'pending';
    await invitation.save();

    try {
      const inviteUrl = `${process.env.CLIENT_URL}/accept-invitation/${rawToken}`;
      await sendEmail({
        to: invitation.email,
        subject: `Reminder: You're invited to join ${invitation.tenantId.name}`,
        html: `
          <p>Hi ${invitation.name || 'there'},</p>
          <p>A reminder that you've been invited to join <strong>${invitation.tenantId.name}</strong> as a <strong>${invitation.role}</strong>.</p>
          <p><a href="${inviteUrl}" style="background:#4f46e5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">Accept Invitation</a></p>
          <p style="color:#64748b;font-size:13px">This link expires in 7 days.</p>
        `,
      });
    } catch (e) {
      console.error('Resend email failed:', e.message);
    }

    res.status(200).json({ success: true, message: 'Invitation resent successfully' });
  } catch (error) { next(error); }
};

// ── POST /api/invitations/resend-by-user/:userId — resend invite by user ID
// Used by Team Management when a pending_invitation user needs a new link
exports.resendByUser = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.userId, tenantId: req.user.tenantId });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Find the most recent pending invitation for this email + tenant
    const invitation = await Invitation.findOne({
      email: user.email,
      tenantId: req.user.tenantId,
      status: { $in: ['pending', 'expired'] },
    }).sort({ createdAt: -1 }).populate('tenantId', 'name');

    if (!invitation) {
      return res.status(404).json({ success: false, message: 'No pending invitation found for this user' });
    }

    // Refresh token and expiry
    const rawToken = crypto.randomBytes(32).toString('hex');
    invitation.token = rawToken;
    invitation.tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    invitation.status = 'pending';
    await invitation.save();

    try {
      const inviteUrl = `${process.env.CLIENT_URL}/accept-invitation/${rawToken}`;
      await sendEmail({
        to: invitation.email,
        subject: `Reminder: You're invited to join ${invitation.tenantId.name}`,
        html: `
          <p>Hi ${invitation.name || 'there'},</p>
          <p>A reminder that you've been invited to join <strong>${invitation.tenantId.name}</strong> as a <strong>${invitation.role}</strong>.</p>
          <p><a href="${inviteUrl}" style="background:#4f46e5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">Accept Invitation</a></p>
          <p style="color:#64748b;font-size:13px">This link expires in 7 days.</p>
        `,
      });
    } catch (e) {
      console.error('Resend email failed:', e.message);
    }

    res.status(200).json({ success: true, message: 'Invitation resent successfully' });
  } catch (error) { next(error); }
};

// ── DELETE /api/invitations/:id — revoke invitation
exports.revokeInvitation = async (req, res, next) => {
  try {
    const invitation = await Invitation.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.user.tenantId, status: 'pending' },
      { status: 'revoked' },
      { new: true }
    );
    if (!invitation) return res.status(404).json({ success: false, message: 'Invitation not found or already actioned' });
    res.status(200).json({ success: true, message: 'Invitation revoked' });
  } catch (error) { next(error); }
};
