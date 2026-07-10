const Invoice    = require('../models/Invoice')
const Quotation  = require('../models/Quotation')
const Payment    = require('../models/Payment')
const CreditNote = require('../models/CreditNote')
const DebitNote  = require('../models/DebitNote')
const Client     = require('../models/Client')
const ClientActivity = require('../models/ClientActivity')
const { getTenantFilter, injectTenantId } = require('../middleware/auth')
const { logAction } = require('../utils/auditLogger')

const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code })

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcGST(subtotalAfterDiscount, taxPercent, gstType) {
  const taxAmount = subtotalAfterDiscount * (taxPercent / 100)
  if (gstType === 'intra_state') {
    return { cgst: taxAmount / 2, sgst: taxAmount / 2, igst: 0, taxAmount }
  } else if (gstType === 'inter_state') {
    return { cgst: 0, sgst: 0, igst: taxAmount, taxAmount }
  }
  return { cgst: 0, sgst: 0, igst: 0, taxAmount }
}

function calcItemTotals(items = [], discountPercent = 0, gstType = 'non_gst') {
  let subtotal = 0
  const processedItems = items.map(it => {
    const base = (it.quantity || 1) * (it.unitPrice || 0)
    const itemDiscount = base * ((it.discount || 0) / 100)
    const amount = base - itemDiscount
    subtotal += amount
    return { ...it, amount }
  })
  const discountAmount = subtotal * (discountPercent / 100)
  const afterDiscount = subtotal - discountAmount
  // Use average tax for GST (first item's taxPercent, or 0)
  const avgTax = items.length > 0 ? (items.reduce((s, i) => s + (i.taxPercent || 0), 0) / items.length) : 0
  const { cgst, sgst, igst, taxAmount } = calcGST(afterDiscount, avgTax, gstType)
  const total = afterDiscount + taxAmount
  return { processedItems, subtotal, discountAmount, taxAmount, cgst, sgst, igst, total }
}

async function logClientActivity(clientId, tenantId, type, description, userId) {
  try {
    await ClientActivity.create({ client: clientId, tenantId, type, description, performedBy: userId })
    await Client.findByIdAndUpdate(clientId, { lastActivityAt: new Date() })
  } catch (_) {}
}

async function syncClientFinancials(clientId, tenantId) {
  try {
    const [invStats] = await Invoice.aggregate([
      { $match: { client: clientId, tenantId } },
      { $group: { _id: null, totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$total', 0] } }, outstandingAmount: { $sum: '$outstanding' } } },
    ])
    if (invStats) {
      await Client.findByIdAndUpdate(clientId, { totalRevenue: invStats.totalRevenue || 0, outstandingAmount: invStats.outstandingAmount || 0 })
    }
  } catch (_) {}
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [invStats, todayPayments, monthlyPayments, overdueInvoices, pendingInvoices, paidInvoices,
      recentInvoices, recentPayments, quotationStats
    ] = await Promise.all([
      // Overall invoice stats
      Invoice.aggregate([
        { $match: { ...tf } },
        { $group: {
          _id: null,
          totalRevenue:   { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$total', 0] } },
          totalPaid:      { $sum: '$paidAmount' },
          totalOutstanding: { $sum: '$outstanding' },
          totalInvoiced:  { $sum: '$total' },
          count:          { $sum: 1 },
        }},
      ]),
      // Today's payments
      Payment.aggregate([
        { $match: { ...tf, paymentDate: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      // This month's payments
      Payment.aggregate([
        { $match: { ...tf, paymentDate: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Invoice.countDocuments({ ...tf, status: 'overdue' }),
      Invoice.countDocuments({ ...tf, status: { $in: ['sent', 'viewed', 'partial'] } }),
      Invoice.countDocuments({ ...tf, status: 'paid' }),
      Invoice.find({ ...tf }).sort({ createdAt: -1 }).limit(5)
        .populate('client', 'companyName').select('invoiceNumber client total status dueDate createdAt'),
      Payment.find({ ...tf }).sort({ paymentDate: -1 }).limit(5)
        .populate('client', 'companyName').populate('invoice', 'invoiceNumber')
        .select('paymentNumber amount paymentDate paymentMethod client invoice'),
      Quotation.aggregate([
        { $match: { ...tf } },
        { $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$total' },
        }},
      ]),
    ])

    // Average collection time (days from invoice creation to paid)
    const paidDocs = await Invoice.find({ ...tf, status: 'paid', paidDate: { $exists: true } })
      .select('createdAt paidDate').limit(100)
    const avgDays = paidDocs.length > 0
      ? Math.round(paidDocs.reduce((s, d) => s + (new Date(d.paidDate) - new Date(d.createdAt)) / 86400000, 0) / paidDocs.length)
      : 0

    const inv = invStats[0] || { totalRevenue: 0, totalPaid: 0, totalOutstanding: 0, totalInvoiced: 0, count: 0 }
    const collectionPct = inv.totalInvoiced > 0 ? Math.round((inv.totalPaid / inv.totalInvoiced) * 100) : 0

    const quotStats = {}
    quotationStats.forEach(q => { quotStats[q._id] = { count: q.count, total: q.total } })

    res.json({
      success: true,
      data: {
        kpis: {
          totalRevenue:      inv.totalRevenue,
          totalPaid:         inv.totalPaid,
          totalOutstanding:  inv.totalOutstanding,
          totalInvoiced:     inv.totalInvoiced,
          todayCollection:   todayPayments[0]?.total || 0,
          monthlyCollection: monthlyPayments[0]?.total || 0,
          overdueCount:      overdueInvoices,
          pendingCount:      pendingInvoices,
          paidCount:         paidInvoices,
          collectionPct,
          avgCollectionDays: avgDays,
        },
        recentInvoices,
        recentPayments,
        quotationStats: quotStats,
      },
    })
  } catch (e) { next(e) }
}

// ── INVOICES ──────────────────────────────────────────────────────────────────
exports.getInvoices = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { page = 1, limit = 20, status, search, clientId, dateFrom, dateTo, paymentMethod } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const query = { ...tf }
    if (status) query.status = status
    if (clientId) query.client = clientId
    if (paymentMethod) query.paymentMethod = paymentMethod
    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo) query.createdAt.$lte = new Date(dateTo)
    }
    if (search) {
      const clients = await Client.find({ ...tf, companyName: { $regex: search, $options: 'i' } }).select('_id')
      const clientIds = clients.map(c => c._id)
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { client: { $in: clientIds } },
        { notes: { $regex: search, $options: 'i' } },
      ]
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('client', 'companyName brandName phone email gstNumber')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Invoice.countDocuments(query),
    ])

    res.json({ success: true, data: invoices, total, page: Number(page), pages: Math.ceil(total / Number(limit)) })
  } catch (e) { next(e) }
}

exports.createInvoice = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { items = [], discountPercent = 0, gstType = 'non_gst', ...rest } = req.body

    const { processedItems, subtotal, discountAmount, taxAmount, cgst, sgst, igst, total } =
      calcItemTotals(items, discountPercent, gstType)

    const invoice = await Invoice.create(injectTenantId(req, {
      ...rest, items: processedItems, subtotal, discountAmount, discountPercent,
      taxAmount, cgst, sgst, igst, total, gstType,
      createdBy: req.user._id,
      paymentTimeline: [{ type: 'invoice_created', date: new Date(), note: 'Invoice created', by: req.user._id }],
    }))

    // Log client activity + audit
    logClientActivity(invoice.client, invoice.tenantId, 'invoice_created', `Invoice ${invoice.invoiceNumber} created`, req.user._id)
    logAction({ req, action: 'INVOICE_CREATED', module: 'finance', resourceId: invoice._id, resourceType: 'Invoice', details: { invoiceNumber: invoice.invoiceNumber, total }, performedBy: req.user._id, tenantId: invoice.tenantId })
    syncClientFinancials(invoice.client, invoice.tenantId)

    res.status(201).json({ success: true, data: invoice })
  } catch (e) { next(e) }
}

exports.updateInvoice = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const invoice = await Invoice.findOne({ _id: req.params.id, ...tf })
    if (!invoice) return next(err('Invoice not found', 404))
    if (['paid', 'cancelled'].includes(invoice.status) && req.body.status !== invoice.status) {
      // Allow status change but not item edits on paid/cancelled
    }

    const { items, discountPercent, gstType, ...rest } = req.body
    if (items) {
      const calc = calcItemTotals(items, discountPercent ?? invoice.discountPercent, gstType ?? invoice.gstType)
      Object.assign(invoice, {
        items: calc.processedItems, subtotal: calc.subtotal,
        discountAmount: calc.discountAmount, discountPercent: discountPercent ?? invoice.discountPercent,
        taxAmount: calc.taxAmount, cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst,
        total: calc.total, gstType: gstType ?? invoice.gstType,
      })
    }
    Object.assign(invoice, rest)

    // Auto-update workflow timestamps
    if (rest.status === 'sent' && !invoice.sentAt) invoice.sentAt = new Date()
    if (rest.status === 'viewed' && !invoice.viewedAt) invoice.viewedAt = new Date()

    await invoice.save()
    logAction({ req, action: 'INVOICE_UPDATED', module: 'finance', resourceId: invoice._id, resourceType: 'Invoice', details: { invoiceNumber: invoice.invoiceNumber }, performedBy: req.user._id, tenantId: invoice.tenantId })
    syncClientFinancials(invoice.client, invoice.tenantId)

    res.json({ success: true, data: invoice })
  } catch (e) { next(e) }
}

exports.duplicateInvoice = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const orig = await Invoice.findOne({ _id: req.params.id, ...tf })
    if (!orig) return next(err('Invoice not found', 404))

    const data = orig.toObject()
    delete data._id; delete data.invoiceNumber; delete data.createdAt; delete data.updatedAt
    delete data.paidAmount; delete data.paidDate; delete data.paymentTimeline
    data.status = 'draft'
    data.outstanding = data.total
    data.createdBy = req.user._id
    data.paymentTimeline = [{ type: 'invoice_created', date: new Date(), note: 'Duplicated invoice', by: req.user._id }]

    const copy = await Invoice.create(injectTenantId(req, data))
    res.status(201).json({ success: true, data: copy })
  } catch (e) { next(e) }
}

exports.deleteInvoice = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const invoice = await Invoice.findOneAndDelete({ _id: req.params.id, ...tf })
    if (!invoice) return next(err('Invoice not found', 404))
    await Payment.deleteMany({ invoice: invoice._id, ...tf })
    logAction({ req, action: 'INVOICE_DELETED', module: 'finance', resourceId: invoice._id, resourceType: 'Invoice', details: { invoiceNumber: invoice.invoiceNumber }, performedBy: req.user._id, tenantId: invoice.tenantId })
    syncClientFinancials(invoice.client, invoice.tenantId)
    res.json({ success: true, message: 'Invoice deleted' })
  } catch (e) { next(e) }
}

exports.cancelInvoice = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const invoice = await Invoice.findOne({ _id: req.params.id, ...tf })
    if (!invoice) return next(err('Invoice not found', 404))
    if (invoice.status === 'paid') return next(err('Cannot cancel a paid invoice'))
    invoice.status = 'cancelled'
    invoice.cancelReason = req.body.reason || ''
    invoice.cancelledAt = new Date()
    invoice.paymentTimeline.push({ type: 'invoice_cancelled', date: new Date(), note: req.body.reason || 'Invoice cancelled', by: req.user._id })
    await invoice.save()
    logAction({ req, action: 'INVOICE_CANCELLED', module: 'finance', resourceId: invoice._id, resourceType: 'Invoice', details: { invoiceNumber: invoice.invoiceNumber }, performedBy: req.user._id, tenantId: invoice.tenantId })
    syncClientFinancials(invoice.client, invoice.tenantId)
    res.json({ success: true, data: invoice })
  } catch (e) { next(e) }
}

// ── PAYMENTS ──────────────────────────────────────────────────────────────────
exports.recordPayment = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const invoice = await Invoice.findOne({ _id: req.params.invoiceId, ...tf })
    if (!invoice) return next(err('Invoice not found', 404))

    const { amount, paymentDate, paymentMethod, referenceNumber, transactionId, remarks, receiptUrl, collectedBy } = req.body
    const payAmt = Number(amount)
    if (!payAmt || payAmt <= 0) return next(err('Valid amount required'))
    if (payAmt > invoice.outstanding + 0.01) return next(err(`Amount (${payAmt}) exceeds outstanding (${invoice.outstanding})`))

    // Create standalone Payment record
    const payment = await Payment.create(injectTenantId(req, {
      invoice: invoice._id,
      client: invoice.client,
      amount: payAmt,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMethod: paymentMethod || 'other',
      referenceNumber: referenceNumber || '',
      transactionId: transactionId || '',
      remarks: remarks || '',
      receiptUrl: receiptUrl || '',
      collectedBy: collectedBy || req.user._id,
      createdBy: req.user._id,
    }))

    // Update invoice
    invoice.paidAmount = (invoice.paidAmount || 0) + payAmt
    invoice.outstanding = Math.max(0, invoice.total - invoice.paidAmount)
    invoice.status = invoice.outstanding <= 0 ? 'paid' : 'partial'
    if (invoice.status === 'paid') { invoice.paidDate = payment.paymentDate; invoice.paymentMethod = paymentMethod || 'other' }
    invoice.paymentTimeline.push({ type: 'payment_received', date: payment.paymentDate, note: `${paymentMethod || 'Payment'} of ₹${payAmt}`, amount: payAmt, by: req.user._id })
    await invoice.save()

    // Log activity
    logClientActivity(invoice.client, invoice.tenantId, 'invoice_paid', `Payment ₹${payAmt} recorded on ${invoice.invoiceNumber}`, req.user._id)
    logAction({ req, action: 'PAYMENT_RECORDED', module: 'finance', resourceId: payment._id, resourceType: 'Payment', details: { invoiceNumber: invoice.invoiceNumber, amount: payAmt }, performedBy: req.user._id, tenantId: payment.tenantId })
    syncClientFinancials(invoice.client, invoice.tenantId)

    res.status(201).json({ success: true, data: { payment, invoice } })
  } catch (e) { next(e) }
}

exports.getPayments = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { page = 1, limit = 20, clientId, invoiceId, dateFrom, dateTo, paymentMethod } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const query = { ...tf }
    if (clientId)     query.client = clientId
    if (invoiceId)    query.invoice = invoiceId
    if (paymentMethod) query.paymentMethod = paymentMethod
    if (dateFrom || dateTo) {
      query.paymentDate = {}
      if (dateFrom) query.paymentDate.$gte = new Date(dateFrom)
      if (dateTo)   query.paymentDate.$lte = new Date(dateTo)
    }

    const [payments, total] = await Promise.all([
      Payment.find(query)
        .populate('client', 'companyName')
        .populate('invoice', 'invoiceNumber total')
        .populate('collectedBy', 'name')
        .sort({ paymentDate: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Payment.countDocuments(query),
    ])

    res.json({ success: true, data: payments, total, page: Number(page) })
  } catch (e) { next(e) }
}

exports.updatePayment = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const payment = await Payment.findOneAndUpdate({ _id: req.params.id, ...tf }, req.body, { new: true })
    if (!payment) return next(err('Payment not found', 404))
    logAction({ req, action: 'PAYMENT_UPDATED', module: 'finance', resourceId: payment._id, resourceType: 'Payment', details: { amount: payment.amount }, performedBy: req.user._id, tenantId: payment.tenantId })
    res.json({ success: true, data: payment })
  } catch (e) { next(e) }
}

// ── QUOTATIONS ────────────────────────────────────────────────────────────────
exports.getQuotations = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { page = 1, limit = 20, status, search, clientId, dateFrom, dateTo } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const query = { ...tf }
    if (status)   query.status = status
    if (clientId) query.client = clientId
    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo)   query.createdAt.$lte = new Date(dateTo)
    }
    if (search) {
      const clients = await Client.find({ ...tf, companyName: { $regex: search, $options: 'i' } }).select('_id')
      query.$or = [
        { quoteNumber: { $regex: search, $options: 'i' } },
        { client: { $in: clients.map(c => c._id) } },
      ]
    }

    const [quotations, total] = await Promise.all([
      Quotation.find(query)
        .populate('client', 'companyName brandName phone email')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Quotation.countDocuments(query),
    ])

    res.json({ success: true, data: quotations, total, page: Number(page) })
  } catch (e) { next(e) }
}

exports.createQuotation = async (req, res, next) => {
  try {
    const { items = [], discountPercent = 0, gstType = 'non_gst', ...rest } = req.body
    const { processedItems, subtotal, discountAmount, taxAmount, cgst, sgst, igst, total } =
      calcItemTotals(items, discountPercent, gstType)

    const quotation = await Quotation.create(injectTenantId(req, {
      ...rest, items: processedItems, subtotal, discountAmount, discountPercent,
      taxAmount, cgst, sgst, igst, total, gstType,
      createdBy: req.user._id,
    }))

    logClientActivity(quotation.client, quotation.tenantId, 'quotation_created', `Quotation ${quotation.quoteNumber} created`, req.user._id)
    logAction({ req, action: 'QUOTATION_CREATED', module: 'finance', resourceId: quotation._id, resourceType: 'Quotation', details: { quoteNumber: quotation.quoteNumber, total }, performedBy: req.user._id, tenantId: quotation.tenantId })

    res.status(201).json({ success: true, data: quotation })
  } catch (e) { next(e) }
}

exports.updateQuotation = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const quotation = await Quotation.findOne({ _id: req.params.id, ...tf })
    if (!quotation) return next(err('Quotation not found', 404))

    const { items, discountPercent, gstType, ...rest } = req.body
    if (items) {
      const calc = calcItemTotals(items, discountPercent ?? quotation.discountPercent, gstType ?? quotation.gstType)
      Object.assign(quotation, {
        items: calc.processedItems, subtotal: calc.subtotal,
        discountAmount: calc.discountAmount, discountPercent: discountPercent ?? quotation.discountPercent,
        taxAmount: calc.taxAmount, cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst,
        total: calc.total, gstType: gstType ?? quotation.gstType,
      })
    }
    Object.assign(quotation, rest)
    if (rest.status === 'sent' && !quotation.sentAt) quotation.sentAt = new Date()
    if (rest.status === 'viewed' && !quotation.viewedAt) quotation.viewedAt = new Date()
    await quotation.save()
    logAction({ req, action: 'QUOTATION_UPDATED', module: 'finance', resourceId: quotation._id, resourceType: 'Quotation', details: {}, performedBy: req.user._id, tenantId: quotation.tenantId })
    res.json({ success: true, data: quotation })
  } catch (e) { next(e) }
}

exports.duplicateQuotation = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const orig = await Quotation.findOne({ _id: req.params.id, ...tf })
    if (!orig) return next(err('Quotation not found', 404))

    const data = orig.toObject()
    delete data._id; delete data.quoteNumber; delete data.createdAt; delete data.updatedAt
    delete data.convertedInvoiceId; delete data.sentAt; delete data.viewedAt
    data.status = 'draft'
    data.createdBy = req.user._id

    const copy = await Quotation.create(injectTenantId(req, data))
    res.status(201).json({ success: true, data: copy })
  } catch (e) { next(e) }
}

exports.convertQuotation = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const quotation = await Quotation.findOne({ _id: req.params.id, ...tf })
    if (!quotation) return next(err('Quotation not found', 404))
    if (quotation.status === 'converted') return next(err('Already converted'))

    const { items = [], discountPercent, gstType, ...extraInvoiceFields } = req.body
    const useItems = items.length ? items : quotation.items
    const calc = calcItemTotals(useItems, discountPercent ?? quotation.discountPercent, gstType ?? quotation.gstType)

    const invoice = await Invoice.create(injectTenantId(req, {
      client:           quotation.client,
      items:            calc.processedItems,
      subtotal:         calc.subtotal,
      discountAmount:   calc.discountAmount,
      discountPercent:  discountPercent ?? quotation.discountPercent,
      taxAmount:        calc.taxAmount,
      cgst:             calc.cgst,
      sgst:             calc.sgst,
      igst:             calc.igst,
      total:            calc.total,
      gstType:          gstType ?? quotation.gstType,
      gstNumber:        quotation.gstNumber,
      clientGstNumber:  quotation.clientGstNumber,
      notes:            quotation.notes,
      linkedQuotationId: quotation._id,
      createdBy:        req.user._id,
      paymentTimeline:  [{ type: 'invoice_created', date: new Date(), note: `Created from ${quotation.quoteNumber}`, by: req.user._id }],
      ...extraInvoiceFields,
    }))

    quotation.status = 'converted'
    quotation.convertedInvoiceId = invoice._id
    await quotation.save()

    logClientActivity(quotation.client, quotation.tenantId, 'quotation_approved', `${quotation.quoteNumber} converted to ${invoice.invoiceNumber}`, req.user._id)
    logAction({ req, action: 'QUOTATION_CONVERTED', module: 'finance', resourceId: quotation._id, resourceType: 'Quotation', details: { quoteNumber: quotation.quoteNumber, invoiceNumber: invoice.invoiceNumber }, performedBy: req.user._id, tenantId: quotation.tenantId })
    syncClientFinancials(quotation.client, quotation.tenantId)

    res.json({ success: true, data: { quotation, invoice } })
  } catch (e) { next(e) }
}

exports.deleteQuotation = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const q = await Quotation.findOneAndDelete({ _id: req.params.id, ...tf })
    if (!q) return next(err('Quotation not found', 404))
    logAction({ req, action: 'QUOTATION_DELETED', module: 'finance', resourceId: q._id, resourceType: 'Quotation', details: { quoteNumber: q.quoteNumber }, performedBy: req.user._id, tenantId: q.tenantId })
    res.json({ success: true, message: 'Quotation deleted' })
  } catch (e) { next(e) }
}

// ── COLLECTIONS ───────────────────────────────────────────────────────────────
exports.getCollections = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { year, month } = req.query
    const now = new Date()
    const targetYear  = Number(year)  || now.getFullYear()
    const targetMonth = Number(month) // optional

    // Monthly breakdown for current year
    const monthlyData = await Payment.aggregate([
      { $match: { ...tf, paymentDate: { $gte: new Date(targetYear, 0, 1), $lt: new Date(targetYear + 1, 0, 1) } } },
      { $group: { _id: { month: { $month: '$paymentDate' } }, collected: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { '_id.month': 1 } },
    ])

    // Summary by payment method
    const byMethod = await Payment.aggregate([
      { $match: { ...tf } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ])

    // Overall
    const [overall] = await Invoice.aggregate([
      { $match: { ...tf } },
      { $group: {
        _id: null,
        totalInvoiced: { $sum: '$total' },
        totalCollected: { $sum: '$paidAmount' },
        totalOutstanding: { $sum: '$outstanding' },
        overdueAmount: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, '$outstanding', 0] } },
      }},
    ])

    // Top clients by collection
    const topClients = await Payment.aggregate([
      { $match: { ...tf } },
      { $group: { _id: '$client', totalCollected: { $sum: '$amount' }, paymentCount: { $sum: 1 } } },
      { $sort: { totalCollected: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'clients', localField: '_id', foreignField: '_id', as: 'client' } },
      { $unwind: '$client' },
      { $project: { 'client.companyName': 1, 'client.phone': 1, totalCollected: 1, paymentCount: 1 } },
    ])

    const ov = overall || { totalInvoiced: 0, totalCollected: 0, totalOutstanding: 0, overdueAmount: 0 }
    const collectionPct = ov.totalInvoiced > 0 ? Math.round((ov.totalCollected / ov.totalInvoiced) * 100) : 0

    res.json({
      success: true,
      data: { ...ov, collectionPct, monthlyData, byMethod, topClients, year: targetYear },
    })
  } catch (e) { next(e) }
}

// ── GST SUMMARY ───────────────────────────────────────────────────────────────
exports.getGSTSummary = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { year, month } = req.query
    const now = new Date()
    const targetYear  = Number(year)  || now.getFullYear()
    const targetMonth = month ? Number(month) : null

    let dateFilter = { $gte: new Date(targetYear, 0, 1), $lt: new Date(targetYear + 1, 0, 1) }
    if (targetMonth) {
      dateFilter = { $gte: new Date(targetYear, targetMonth - 1, 1), $lt: new Date(targetYear, targetMonth, 1) }
    }

    const gstInvoices = await Invoice.aggregate([
      { $match: { ...tf, gstType: { $ne: 'non_gst' }, status: { $ne: 'cancelled' }, createdAt: dateFilter } },
      { $group: {
        _id: { gstType: '$gstType', month: { $month: '$createdAt' } },
        totalTaxable: { $sum: { $subtract: ['$total', '$taxAmount'] } },
        cgst: { $sum: '$cgst' },
        sgst: { $sum: '$sgst' },
        igst: { $sum: '$igst' },
        taxAmount: { $sum: '$taxAmount' },
        count: { $sum: 1 },
      }},
      { $sort: { '_id.month': 1 } },
    ])

    const [totals] = await Invoice.aggregate([
      { $match: { ...tf, gstType: { $ne: 'non_gst' }, status: { $ne: 'cancelled' }, createdAt: dateFilter } },
      { $group: {
        _id: null,
        totalCGST: { $sum: '$cgst' },
        totalSGST: { $sum: '$sgst' },
        totalIGST: { $sum: '$igst' },
        totalTax:  { $sum: '$taxAmount' },
        totalTaxableAmount: { $sum: { $subtract: ['$total', '$taxAmount'] } },
        invoiceCount: { $sum: 1 },
      }},
    ])

    // Non-GST summary
    const [nonGst] = await Invoice.aggregate([
      { $match: { ...tf, gstType: 'non_gst', status: { $ne: 'cancelled' }, createdAt: dateFilter } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ])

    res.json({
      success: true,
      data: {
        year: targetYear,
        month: targetMonth,
        totals: totals || { totalCGST: 0, totalSGST: 0, totalIGST: 0, totalTax: 0, totalTaxableAmount: 0, invoiceCount: 0 },
        nonGst: nonGst || { total: 0, count: 0 },
        breakdown: gstInvoices,
      },
    })
  } catch (e) { next(e) }
}

// ── REVENUE SUMMARY ───────────────────────────────────────────────────────────
exports.getRevenueSummary = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { year } = req.query
    const now = new Date()
    const targetYear = Number(year) || now.getFullYear()

    const [monthly, yearly, byStatus, byClient] = await Promise.all([
      // Monthly revenue for target year
      Invoice.aggregate([
        { $match: { ...tf, status: { $ne: 'cancelled' }, createdAt: { $gte: new Date(targetYear, 0, 1), $lt: new Date(targetYear + 1, 0, 1) } } },
        { $group: { _id: { month: { $month: '$createdAt' } }, invoiced: { $sum: '$total' }, collected: { $sum: '$paidAmount' }, outstanding: { $sum: '$outstanding' }, count: { $sum: 1 } } },
        { $sort: { '_id.month': 1 } },
      ]),
      // Yearly summary (last 3 years)
      Invoice.aggregate([
        { $match: { ...tf, status: { $ne: 'cancelled' }, createdAt: { $gte: new Date(targetYear - 2, 0, 1) } } },
        { $group: { _id: { year: { $year: '$createdAt' } }, invoiced: { $sum: '$total' }, collected: { $sum: '$paidAmount' } } },
        { $sort: { '_id.year': 1 } },
      ]),
      // By status
      Invoice.aggregate([
        { $match: { ...tf, createdAt: { $gte: new Date(targetYear, 0, 1), $lt: new Date(targetYear + 1, 0, 1) } } },
        { $group: { _id: '$status', total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      // Top 10 clients by revenue
      Invoice.aggregate([
        { $match: { ...tf, status: { $ne: 'cancelled' } } },
        { $group: { _id: '$client', invoiced: { $sum: '$total' }, collected: { $sum: '$paidAmount' }, count: { $sum: 1 } } },
        { $sort: { invoiced: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'clients', localField: '_id', foreignField: '_id', as: 'client' } },
        { $unwind: '$client' },
        { $project: { 'client.companyName': 1, 'client.phone': 1, invoiced: 1, collected: 1, count: 1 } },
      ]),
    ])

    res.json({ success: true, data: { year: targetYear, monthly, yearly, byStatus, byClient } })
  } catch (e) { next(e) }
}

// ── CREDIT NOTES ──────────────────────────────────────────────────────────────
exports.getCreditNotes = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { page = 1, limit = 20, clientId, status } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    const query = { ...tf }
    if (clientId) query.client = clientId
    if (status)   query.status = status

    const [notes, total] = await Promise.all([
      CreditNote.find(query).populate('client', 'companyName').populate('invoice', 'invoiceNumber').populate('createdBy', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      CreditNote.countDocuments(query),
    ])
    res.json({ success: true, data: notes, total })
  } catch (e) { next(e) }
}

exports.createCreditNote = async (req, res, next) => {
  try {
    const note = await CreditNote.create(injectTenantId(req, { ...req.body, createdBy: req.user._id }))
    logAction({ req, action: 'CREDIT_NOTE_CREATED', module: 'finance', resourceId: note._id, resourceType: 'CreditNote', details: { creditNoteNumber: note.creditNoteNumber }, performedBy: req.user._id, tenantId: note.tenantId })
    res.status(201).json({ success: true, data: note })
  } catch (e) { next(e) }
}

exports.updateCreditNote = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const note = await CreditNote.findOneAndUpdate({ _id: req.params.id, ...tf }, req.body, { new: true })
    if (!note) return next(err('Credit note not found', 404))
    res.json({ success: true, data: note })
  } catch (e) { next(e) }
}

exports.deleteCreditNote = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const note = await CreditNote.findOneAndDelete({ _id: req.params.id, ...tf })
    if (!note) return next(err('Credit note not found', 404))
    res.json({ success: true, message: 'Deleted' })
  } catch (e) { next(e) }
}

// ── DEBIT NOTES ───────────────────────────────────────────────────────────────
exports.getDebitNotes = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { page = 1, limit = 20, clientId, status } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    const query = { ...tf }
    if (clientId) query.client = clientId
    if (status)   query.status = status

    const [notes, total] = await Promise.all([
      DebitNote.find(query).populate('client', 'companyName').populate('invoice', 'invoiceNumber').populate('createdBy', 'name')
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      DebitNote.countDocuments(query),
    ])
    res.json({ success: true, data: notes, total })
  } catch (e) { next(e) }
}

exports.createDebitNote = async (req, res, next) => {
  try {
    const note = await DebitNote.create(injectTenantId(req, { ...req.body, createdBy: req.user._id }))
    logAction({ req, action: 'DEBIT_NOTE_CREATED', module: 'finance', resourceId: note._id, resourceType: 'DebitNote', details: { debitNoteNumber: note.debitNoteNumber }, performedBy: req.user._id, tenantId: note.tenantId })
    res.status(201).json({ success: true, data: note })
  } catch (e) { next(e) }
}

exports.updateDebitNote = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const note = await DebitNote.findOneAndUpdate({ _id: req.params.id, ...tf }, req.body, { new: true })
    if (!note) return next(err('Debit note not found', 404))
    res.json({ success: true, data: note })
  } catch (e) { next(e) }
}

exports.deleteDebitNote = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const note = await DebitNote.findOneAndDelete({ _id: req.params.id, ...tf })
    if (!note) return next(err('Debit note not found', 404))
    res.json({ success: true, message: 'Deleted' })
  } catch (e) { next(e) }
}

// ── BULK ACTIONS ──────────────────────────────────────────────────────────────
exports.bulkAction = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { action, ids, type = 'invoice' } = req.body
    if (!ids?.length) return next(err('No IDs provided'))
    const Model = type === 'quotation' ? Quotation : Invoice

    switch (action) {
      case 'delete':
        await Model.deleteMany({ _id: { $in: ids }, ...tf })
        break
      case 'mark_paid':
        if (type === 'invoice') {
          await Invoice.updateMany({ _id: { $in: ids }, ...tf }, { $set: { status: 'paid', outstanding: 0 } })
        }
        break
      case 'archive':
        await Model.updateMany({ _id: { $in: ids }, ...tf }, { $set: { archivedAt: new Date() } })
        break
      case 'mark_sent':
        await Model.updateMany({ _id: { $in: ids }, status: 'draft', ...tf }, { $set: { status: 'sent', sentAt: new Date() } })
        break
      default:
        return next(err(`Unknown bulk action: ${action}`))
    }

    res.json({ success: true, message: `Bulk ${action} completed on ${ids.length} records` })
  } catch (e) { next(e) }
}

// ── EXPORT CSV ────────────────────────────────────────────────────────────────
exports.exportCSV = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { type = 'invoice', status, dateFrom, dateTo } = req.query
    const Model = type === 'quotation' ? Quotation : type === 'payment' ? Payment : Invoice
    const query = { ...tf }
    if (status) query.status = status
    if (dateFrom || dateTo) {
      const field = type === 'payment' ? 'paymentDate' : 'createdAt'
      query[field] = {}
      if (dateFrom) query[field].$gte = new Date(dateFrom)
      if (dateTo)   query[field].$lte = new Date(dateTo)
    }

    const docs = await Model.find(query)
      .populate('client', 'companyName email phone')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(2000)

    let headers, rows
    if (type === 'invoice') {
      headers = ['Invoice #', 'Client', 'Date', 'Due Date', 'Subtotal', 'Tax', 'Total', 'Paid', 'Outstanding', 'Status']
      rows = docs.map(d => [
        d.invoiceNumber, d.client?.companyName || '',
        d.createdAt?.toISOString().split('T')[0] || '',
        d.dueDate?.toISOString().split('T')[0] || '',
        d.subtotal, d.taxAmount, d.total, d.paidAmount, d.outstanding, d.status,
      ])
    } else if (type === 'quotation') {
      headers = ['Quote #', 'Client', 'Date', 'Expiry', 'Total', 'Status']
      rows = docs.map(d => [
        d.quoteNumber, d.client?.companyName || '',
        d.createdAt?.toISOString().split('T')[0] || '',
        d.validUntil?.toISOString().split('T')[0] || '',
        d.total, d.status,
      ])
    } else {
      headers = ['Payment #', 'Client', 'Invoice', 'Date', 'Amount', 'Method', 'Reference']
      rows = docs.map(d => [
        d.paymentNumber, d.client?.companyName || '', d.invoice?.invoiceNumber || '',
        d.paymentDate?.toISOString().split('T')[0] || '',
        d.amount, d.paymentMethod, d.referenceNumber,
      ])
    }

    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${type}-export-${Date.now()}.csv"`)
    res.send(csv)
  } catch (e) { next(e) }
}
