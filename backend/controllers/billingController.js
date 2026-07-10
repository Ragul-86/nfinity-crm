const Billing = require('../models/Billing')
const Client = require('../models/Client')
const Notification = require('../models/Notification')
const { getTenantFilter, injectTenantId } = require('../middleware/auth')

// GET /api/billing?clientId=xxx
exports.getBillings = async (req, res) => {
  const { clientId, status, page = 1, limit = 20 } = req.query
  const tf = getTenantFilter(req)
  const filter = { ...tf }
  if (clientId) filter.client = clientId
  if (status && status !== 'all') filter.status = status

  const [data, total] = await Promise.all([
    Billing.find(filter).populate('client', 'companyName brandName').populate('createdBy', 'name')
      .sort({ createdAt: -1 }).skip((page-1)*Number(limit)).limit(Number(limit)),
    Billing.countDocuments(filter),
  ])
  res.json({ success: true, data, total })
}

// GET /api/billing/stats — revenue summary
exports.getBillingStats = async (req, res) => {
  const { dateFrom, dateTo } = req.query
  const tf = getTenantFilter(req)
  const dateFilter = {}
  if (dateFrom) dateFilter.$gte = new Date(dateFrom)
  if (dateTo) dateFilter.$lte = new Date(dateTo)
  const filter = { ...tf, ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) }

  const [paid, pending, overdue, totalRevenue] = await Promise.all([
    Billing.countDocuments({ ...filter, status: 'paid' }),
    Billing.countDocuments({ ...filter, status: 'pending' }),
    Billing.countDocuments({ ...filter, status: 'overdue' }),
    Billing.aggregate([{ $match: { ...filter, status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ])
  const outstanding = await Billing.aggregate([
    { $match: { ...filter, status: { $in: ['pending', 'overdue'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ])

  res.json({
    success: true,
    data: {
      paid, pending, overdue,
      totalRevenue: totalRevenue[0]?.total || 0,
      outstanding: outstanding[0]?.total || 0,
    }
  })
}

// POST /api/billing
exports.createBilling = async (req, res) => {
  const billing = await Billing.create({ ...req.body, createdBy: req.user._id, tenantId: injectTenantId(req) })
  await billing.populate('client', 'companyName')
  res.status(201).json({ success: true, data: billing })
}

// PUT /api/billing/:id
exports.updateBilling = async (req, res) => {
  const billing = await Billing.findOneAndUpdate(
    { _id: req.params.id, ...getTenantFilter(req) },
    req.body,
    { new: true, runValidators: true }
  ).populate('client', 'companyName')
  if (!billing) return res.status(404).json({ success: false, message: 'Invoice not found' })
  res.json({ success: true, data: billing })
}

// DELETE /api/billing/:id
exports.deleteBilling = async (req, res) => {
  await Billing.findOneAndDelete({ _id: req.params.id, ...getTenantFilter(req) })
  res.json({ success: true, message: 'Invoice deleted' })
}

// GET /api/billing/monthly — monthly revenue for chart
exports.getMonthlyRevenue = async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear()
  const tf = getTenantFilter(req)
  const data = await Billing.aggregate([
    { $match: { ...tf, status: 'paid', paidDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } } },
    { $group: { _id: { month: { $month: '$paidDate' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $sort: { '_id.month': 1 } },
  ])
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const result = months.map((m, i) => {
    const found = data.find(d => d._id.month === i + 1)
    return { month: m, revenue: found?.revenue || 0, invoices: found?.count || 0 }
  })
  res.json({ success: true, data: result })
}

// GET /api/billing/export
exports.exportBillings = async (req, res) => {
  const tf = getTenantFilter(req)
  const billings = await Billing.find(tf).populate('client', 'companyName').sort({ createdAt: -1 })
  const headers = ['Invoice #', 'Client', 'Amount (₹)', 'Description', 'Due Date', 'Paid Date', 'Status']
  const rows = billings.map(b => [
    b.invoiceNumber, b.client?.companyName || '', b.amount, b.description || '',
    b.dueDate ? new Date(b.dueDate).toLocaleDateString() : '',
    b.paidDate ? new Date(b.paidDate).toLocaleDateString() : '',
    b.status,
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="billing-${Date.now()}.csv"`)
  res.send(csv)
}

// Auto-wrap all exported async functions with error forwarding
Object.keys(exports).forEach(k => {
  const fn = exports[k]
  if (typeof fn === 'function' && fn.constructor.name === 'AsyncFunction') {
    exports[k] = async (req, res, next) => {
      try { await fn(req, res, next) } catch (err) { next(err) }
    }
  }
})
