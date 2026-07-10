/**
 * clientPortalController.js
 * Handles both:
 *   - Portal-side (portal users accessing their data)
 *   - CRM-side management (admins managing portal accounts)
 *
 * Portal JWT contains { id, clientId, tenantId, type:'portal' }
 */
const jwt     = require('jsonwebtoken')
const crypto  = require('crypto')
const mongoose = require('mongoose')

const ClientPortalUser = require('../models/ClientPortalUser')
const SupportTicket    = require('../models/SupportTicket')
const Client    = require('../models/Client')
const Invoice   = require('../models/Invoice')
const Quotation = require('../models/Quotation')
const Payment   = require('../models/Payment')
const Task      = require('../models/Task')
const Meeting   = require('../models/Meeting')
const { getTenantFilter } = require('../middleware/auth')

let SOPAssignment
try { SOPAssignment = require('../models/SOPAssignment') } catch {}

const LOCK_TIME    = 2 * 60 * 60 * 1000  // 2 hours
const MAX_ATTEMPTS = 5
const PORTAL_TOKEN_EXPIRES = '7d'

function signPortalToken(user) {
  return jwt.sign(
    { id: user._id, clientId: user.clientId, tenantId: user.tenantId, type: 'portal' },
    process.env.JWT_SECRET,
    { expiresIn: PORTAL_TOKEN_EXPIRES }
  )
}

function safeUser(u) {
  const obj = typeof u.toObject === 'function' ? u.toObject() : { ...u }
  delete obj.password; delete obj.passwordResetToken; delete obj.passwordResetExpires
  delete obj.loginAttempts; delete obj.lockUntil
  return obj
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL AUTH
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/portal/auth/login
exports.portalLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required' })

    const user = await ClientPortalUser.findOne({ email: email.toLowerCase() }).select('+password +loginAttempts +lockUntil')
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' })

    if (!user.isActive)
      return res.status(403).json({ success: false, message: 'Your portal access has been disabled. Contact support.' })

    if (user.isLocked())
      return res.status(429).json({ success: false, message: 'Account temporarily locked due to too many failed attempts. Try again later.' })

    const match = await user.comparePassword(password)
    if (!match) {
      user.loginAttempts += 1
      if (user.loginAttempts >= MAX_ATTEMPTS) {
        user.lockUntil    = new Date(Date.now() + LOCK_TIME)
        user.loginAttempts = 0
      }
      await user.save()
      return res.status(401).json({ success: false, message: 'Invalid credentials' })
    }

    // Successful login
    user.loginAttempts = 0
    user.lockUntil     = undefined
    user.lastLogin     = new Date()
    await user.save()

    const token = signPortalToken(user)
    res.json({ success: true, token, user: safeUser(user) })
  } catch (e) { next(e) }
}

// GET /api/portal/auth/me
exports.portalMe = async (req, res, next) => {
  try {
    const user = await ClientPortalUser.findById(req.portalUser._id).lean()
    if (!user) return res.status(404).json({ success: false, message: 'User not found' })
    const client = await Client.findById(user.clientId).select('name company email phone status package accountManager').lean()
    res.json({ success: true, user: safeUser(user), client })
  } catch (e) { next(e) }
}

// POST /api/portal/auth/forgot-password
exports.portalForgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body
    const user = await ClientPortalUser.findOne({ email: email?.toLowerCase() }).select('+passwordResetToken +passwordResetExpires')
    // Always respond 200 to prevent email enumeration
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' })

    const token = crypto.randomBytes(32).toString('hex')
    user.passwordResetToken   = crypto.createHash('sha256').update(token).digest('hex')
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await user.save()

    // In production you would send an email here.
    // For now just return the token for development.
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.', _devToken: process.env.NODE_ENV === 'development' ? token : undefined })
  } catch (e) { next(e) }
}

// POST /api/portal/auth/reset-password
exports.portalResetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body
    const hashed = crypto.createHash('sha256').update(token).digest('hex')
    const user = await ClientPortalUser.findOne({
      passwordResetToken: hashed,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires')
    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired reset token' })
    user.password             = password
    user.passwordResetToken   = undefined
    user.passwordResetExpires = undefined
    await user.save()
    res.json({ success: true, message: 'Password updated successfully' })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/portal/dashboard
exports.portalDashboard = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.portalUser
    const now = new Date()

    const [client, invoices, payments, meetings, tasks, sopAssignments] = await Promise.all([
      Client.findById(clientId).select('name company email phone status package accountManager').populate('accountManager', 'name email').lean(),
      Invoice.find({ tenantId, client: clientId }).select('invoiceNumber total status dueDate paidAmount').sort({ createdAt: -1 }).limit(5).lean(),
      Payment.find({ tenantId, client: clientId }).select('amount status paymentDate method').sort({ paymentDate: -1 }).limit(5).lean(),
      Meeting.find({ tenantId, client: clientId, date: { $gte: now } })
        .select('title date duration status location').sort({ date: 1 }).limit(5).lean(),
      Task.find({ tenantId, client: clientId, status: { $ne: 'completed' } })
        .select('title status priority dueDate').sort({ dueDate: 1 }).limit(5).lean(),
      SOPAssignment ? SOPAssignment.find({ tenantId, client: clientId }).select('title progress status dueDate').sort({ createdAt: -1 }).limit(3).lean() : Promise.resolve([]),
    ])

    // Financial summary
    const allInvoices = await Invoice.find({ tenantId, client: clientId }).select('total paidAmount status').lean()
    const totalInvoiced  = allInvoices.reduce((s, i) => s + (i.total || 0), 0)
    const totalPaid      = allInvoices.reduce((s, i) => s + (i.paidAmount || 0), 0)
    const totalOutstanding = totalInvoiced - totalPaid
    const overdueCount = allInvoices.filter(i => i.status === 'overdue').length

    res.json({
      success: true,
      data: {
        client,
        financial: { totalInvoiced, totalPaid, totalOutstanding, overdueCount },
        recentInvoices: invoices,
        recentPayments: payments,
        upcomingMeetings: meetings,
        pendingTasks: tasks,
        sopAssignments,
      },
    })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL DATA ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/portal/invoices
exports.portalInvoices = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.portalUser
    const { status, page = 1, limit = 20 } = req.query
    const filter = { tenantId, client: clientId }
    if (status) filter.status = status
    const skip = (Number(page) - 1) * Number(limit)
    const [data, total] = await Promise.all([
      Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Invoice.countDocuments(filter),
    ])
    res.json({ success: true, total, page: Number(page), data })
  } catch (e) { next(e) }
}

// GET /api/portal/quotations
// Quotation schema uses `client` (ObjectId) not `clientId`
exports.portalQuotations = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.portalUser
    const { page = 1, limit = 20 } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    const [data, total] = await Promise.all([
      Quotation.find({ tenantId, client: clientId }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Quotation.countDocuments({ tenantId, client: clientId }),
    ])
    res.json({ success: true, total, page: Number(page), data })
  } catch (e) { next(e) }
}

// PUT /api/portal/quotations/:id/action
// Quotation status enum: draft|sent|viewed|approved|rejected|expired|converted|cancelled
exports.portalQuotationAction = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.portalUser
    const { action, reason = '' } = req.body  // action: 'approved' | 'rejected' | 'changes_requested'
    const STATUS_MAP = { approved: 'approved', rejected: 'rejected', changes_requested: 'cancelled' }
    if (!STATUS_MAP[action]) return res.status(400).json({ success: false, message: 'Invalid action' })

    const q = await Quotation.findOne({ _id: req.params.id, tenantId, client: clientId })
    if (!q) return res.status(404).json({ success: false, message: 'Quotation not found' })

    q.status = STATUS_MAP[action]
    if (reason) q.remarks = (q.remarks ? q.remarks + '\n' : '') + `[Client] ${reason}`
    await q.save()

    res.json({ success: true, data: q })
  } catch (e) { next(e) }
}

// GET /api/portal/payments
exports.portalPayments = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.portalUser
    const [data, outstanding] = await Promise.all([
      Payment.find({ tenantId, client: clientId }).sort({ paymentDate: -1 }).lean(),
      Invoice.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)), client: new mongoose.Types.ObjectId(String(clientId)), status: { $in: ['sent', 'viewed', 'partial', 'overdue'] } } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$total', { $ifNull: ['$paidAmount', 0] }] } } } },
      ]),
    ])
    res.json({ success: true, data, outstandingAmount: outstanding[0]?.total || 0 })
  } catch (e) { next(e) }
}

// GET /api/portal/tasks
exports.portalTasks = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.portalUser
    const { status } = req.query
    const filter = { tenantId, client: clientId }
    if (status) filter.status = status
    const data = await Task.find(filter).select('title description status priority dueDate assignedTo completedAt').populate('assignedTo', 'name').sort({ dueDate: 1 }).lean()
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

// GET /api/portal/sop
exports.portalSOP = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.portalUser
    if (!SOPAssignment) return res.json({ success: true, data: [] })
    const data = await SOPAssignment.find({ tenantId, client: clientId })
      .populate('sop', 'title description category')
      .sort({ createdAt: -1 }).lean()
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

// GET /api/portal/meetings
exports.portalMeetings = async (req, res, next) => {
  try {
    const { clientId, tenantId } = req.portalUser
    const { upcoming } = req.query
    const filter = { tenantId, client: clientId }
    if (upcoming === 'true') filter.date = { $gte: new Date() }
    const data = await Meeting.find(filter).select('title date duration status location notes agenda outcome').sort({ date: upcoming === 'true' ? 1 : -1 }).limit(30).lean()
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORT TICKETS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/portal/support
exports.portalGetTickets = async (req, res, next) => {
  try {
    const { _id: portalUserId, clientId, tenantId } = req.portalUser
    const data = await SupportTicket.find({ tenantId, portalUserId }).sort({ createdAt: -1 }).lean()
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

// POST /api/portal/support
exports.portalCreateTicket = async (req, res, next) => {
  try {
    const { _id: portalUserId, clientId, tenantId, name } = req.portalUser
    const { title, description, category = 'general', priority = 'medium' } = req.body
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' })
    const ticket = await SupportTicket.create({
      tenantId, clientId, portalUserId, title, description, category, priority,
      messages: description ? [{ sender: 'client', senderName: name, message: description }] : [],
    })
    res.status(201).json({ success: true, data: ticket })
  } catch (e) { next(e) }
}

// GET /api/portal/support/:id
exports.portalGetTicket = async (req, res, next) => {
  try {
    const { _id: portalUserId, tenantId } = req.portalUser
    const ticket = await SupportTicket.findOne({ _id: req.params.id, tenantId, portalUserId })
      .populate('assignedTo', 'name').lean()
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' })
    // Remove internal messages from portal view
    ticket.messages = ticket.messages.filter(m => !m.isInternal)
    res.json({ success: true, data: ticket })
  } catch (e) { next(e) }
}

// POST /api/portal/support/:id/reply
exports.portalReplyTicket = async (req, res, next) => {
  try {
    const { _id: portalUserId, tenantId, name } = req.portalUser
    const { message } = req.body
    if (!message) return res.status(400).json({ success: false, message: 'Message is required' })
    const ticket = await SupportTicket.findOne({ _id: req.params.id, tenantId, portalUserId })
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' })
    ticket.messages.push({ sender: 'client', senderName: name, message })
    if (ticket.status === 'waiting_client') ticket.status = 'in_progress'
    await ticket.save()
    res.json({ success: true, data: ticket })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/portal/profile
exports.portalGetProfile = async (req, res, next) => {
  try {
    const user = await ClientPortalUser.findById(req.portalUser._id).lean()
    res.json({ success: true, data: safeUser(user) })
  } catch (e) { next(e) }
}

// PUT /api/portal/profile
exports.portalUpdateProfile = async (req, res, next) => {
  try {
    const { name, phone, notificationPreferences } = req.body
    const update = {}
    if (name) update.name = name
    if (phone !== undefined) update.phone = phone
    if (notificationPreferences) update.notificationPreferences = notificationPreferences
    const user = await ClientPortalUser.findByIdAndUpdate(req.portalUser._id, update, { new: true }).lean()
    res.json({ success: true, data: safeUser(user) })
  } catch (e) { next(e) }
}

// PUT /api/portal/profile/password
exports.portalChangePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body
    const user = await ClientPortalUser.findById(req.portalUser._id).select('+password')
    const ok = await user.comparePassword(currentPassword)
    if (!ok) return res.status(400).json({ success: false, message: 'Current password is incorrect' })
    user.password = newPassword
    await user.save()
    res.json({ success: true, message: 'Password updated successfully' })
  } catch (e) { next(e) }
}

// ─────────────────────────────────────────────────────────────────────────────
// CRM-SIDE: MANAGE PORTAL USERS (admin routes, use existing CRM auth)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/portal/manage/users
exports.listPortalUsers = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { clientId } = req.query
    const filter = { ...tf }
    if (clientId) filter.clientId = clientId
    const data = await ClientPortalUser.find(filter).populate('clientId', 'name company').sort({ createdAt: -1 }).lean()
    res.json({ success: true, data })
  } catch (e) { next(e) }
}

// POST /api/portal/manage/users
exports.createPortalUser = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const tenantId = tf.tenantId || req.user.tenantId
    const { clientId, name, email, password } = req.body
    if (!clientId || !name || !email || !password)
      return res.status(400).json({ success: false, message: 'clientId, name, email, and password are required' })

    const client = await Client.findOne({ _id: clientId, ...tf })
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' })

    const user = await ClientPortalUser.create({ tenantId, clientId, name, email, password })
    res.status(201).json({ success: true, data: safeUser(user) })
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ success: false, message: 'A portal account with that email already exists' })
    next(e)
  }
}

// PUT /api/portal/manage/users/:id
exports.updatePortalUser = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { isActive, name, password } = req.body
    const user = await ClientPortalUser.findOne({ _id: req.params.id, ...tf })
    if (!user) return res.status(404).json({ success: false, message: 'Portal user not found' })
    if (isActive !== undefined) user.isActive = isActive
    if (name) user.name = name
    if (password) user.password = password
    await user.save()
    res.json({ success: true, data: safeUser(user) })
  } catch (e) { next(e) }
}

// DELETE /api/portal/manage/users/:id
exports.deletePortalUser = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    await ClientPortalUser.findOneAndDelete({ _id: req.params.id, ...tf })
    res.json({ success: true, message: 'Portal user removed' })
  } catch (e) { next(e) }
}
