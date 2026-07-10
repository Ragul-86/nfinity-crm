const AuditLog = require('../models/AuditLog')
const { getTenantFilter } = require('../middleware/auth')

// ── GET /api/audit ─────────────────────────────────────────────────────────────
exports.getAuditLogs = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const {
      page = 1, limit = 25,
      action, userId, module: mod,
      dateFrom, dateTo, q,
      resourceType,
    } = req.query

    const filter = {}
    if (tf.tenantId) filter.tenantId = tf.tenantId

    if (action)   filter.action = action
    if (mod)      filter.module = mod
    if (resourceType) filter.resourceType = resourceType
    if (userId)   filter.$or = [{ performedBy: userId }, { targetUser: userId }]
    if (q)        filter['details'] = { $regex: q, $options: 'i' }

    if (dateFrom || dateTo) {
      filter.createdAt = {}
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom)
      if (dateTo)   filter.createdAt.$lte = new Date(new Date(dateTo).setHours(23,59,59,999))
    }

    const skip = (Number(page) - 1) * Number(limit)
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('performedBy', 'name email avatar role')
        .populate('targetUser', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(filter),
    ])

    res.status(200).json({ success: true, total, page: Number(page), data: logs })
  } catch (error) { next(error) }
}

// ── GET /api/audit/stats ───────────────────────────────────────────────────────
exports.getAuditStats = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const filter = {}
    if (tf.tenantId) filter.tenantId = tf.tenantId

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const week  = new Date(today.getTime() - 7 * 86400000)

    const [total, todayCount, weekCount, byAction, byModule] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.countDocuments({ ...filter, createdAt: { $gte: today } }),
      AuditLog.countDocuments({ ...filter, createdAt: { $gte: week } }),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ])

    res.json({ success: true, data: { total, todayCount, weekCount, byAction, byModule } })
  } catch (error) { next(error) }
}
