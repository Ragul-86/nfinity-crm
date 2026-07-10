const Notification = require('../models/Notification')
const { getTenantFilter, injectTenantId } = require('../middleware/auth')

// ── GET /api/notifications ────────────────────────────────────────────────────
exports.getNotifications = async (req, res, next) => {
  try {
    const { category, severity, unreadOnly, page = 1, limit = 50, q } = req.query
    const filter = { recipient: req.user._id, isArchived: { $ne: true } }
    if (category) filter.category = category
    if (severity) filter.severity = severity
    if (unreadOnly === 'true') filter.isRead = false
    if (q) filter.$or = [
      { title: new RegExp(q, 'i') },
      { message: new RegExp(q, 'i') },
    ]

    const skip = (Number(page) - 1) * Number(limit)
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: req.user._id, isRead: false, isArchived: { $ne: true } }),
    ])

    res.json({ success: true, data: notifications, total, unreadCount, page: Number(page) })
  } catch (err) { next(err) }
}

// ── PUT /api/notifications/:id/read ──────────────────────────────────────────
exports.markRead = async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true }
    )
    res.json({ success: true })
  } catch (err) { next(err) }
}

// ── PUT /api/notifications/mark-all-read ─────────────────────────────────────
exports.markAllRead = async (req, res, next) => {
  try {
    const { category } = req.body
    const filter = { recipient: req.user._id, isRead: false }
    if (category) filter.category = category
    await Notification.updateMany(filter, { isRead: true })
    res.json({ success: true })
  } catch (err) { next(err) }
}

// ── PUT /api/notifications/:id/archive ───────────────────────────────────────
exports.archiveNotification = async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isArchived: true, isRead: true }
    )
    res.json({ success: true })
  } catch (err) { next(err) }
}

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
exports.deleteNotification = async (req, res, next) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id })
    res.json({ success: true })
  } catch (err) { next(err) }
}

// ── DELETE /api/notifications (clear all / clear read) ───────────────────────
exports.clearAll = async (req, res, next) => {
  try {
    const { readOnly } = req.query
    const filter = { recipient: req.user._id }
    if (readOnly === 'true') filter.isRead = true
    await Notification.deleteMany(filter)
    res.json({ success: true })
  } catch (err) { next(err) }
}

// ── POST /api/notifications (internal create — used by other controllers) ─────
exports.createNotification = async (data) => {
  try {
    await Notification.create(data)
  } catch (e) {
    console.error('[Notification] Create failed:', e.message)
  }
}
