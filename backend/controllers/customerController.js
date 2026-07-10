const Client = require('../models/Client')
const Invoice = require('../models/Invoice')
const Quotation = require('../models/Quotation')
const ClientNote = require('../models/ClientNote')
const Meeting = require('../models/Meeting')
const ClientActivity = require('../models/ClientActivity')
const ClientFile = require('../models/ClientFile')
const Task = require('../models/Task')
const SOPAssignment = require('../models/SOPAssignment')
const Lead = require('../models/Lead')
const Notification = require('../models/Notification')
const { getTenantFilter, injectTenantId } = require('../middleware/auth')
const { logAction } = require('../utils/auditLogger')

const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code })

// ── Helper: log customer activity (fire-and-forget) ───────────────────────────
async function logActivity(clientId, tenantId, type, description, userId, metadata = {}) {
  try {
    await ClientActivity.create({ client: clientId, tenantId, type, description, performedBy: userId, metadata })
    await Client.findByIdAndUpdate(clientId, { lastActivityAt: new Date() })
  } catch (_) {}
}

// ── Helper: compute health status ─────────────────────────────────────────────
async function computeHealth(clientId, tenantId) {
  const now = new Date()
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)

  const [overdueInvoices, overdueTasks, client, recentActivity] = await Promise.all([
    Invoice.countDocuments({ client: clientId, status: 'overdue', tenantId }),
    Task.countDocuments({ client: clientId, status: { $ne: 'completed' }, dueDate: { $lt: now }, tenantId }),
    Client.findById(clientId).select('renewalDate lastActivityAt outstandingAmount'),
    ClientActivity.findOne({ client: clientId }).sort({ createdAt: -1 }).select('createdAt'),
  ])

  let score = 100
  if (overdueInvoices > 0) score -= overdueInvoices * 20
  if (overdueTasks > 0) score -= overdueTasks * 10
  if (client?.outstandingAmount > 100000) score -= 20
  if (client?.renewalDate && client.renewalDate < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) score -= 30
  else if (client?.renewalDate && client.renewalDate < new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) score -= 10
  if (!recentActivity || new Date(recentActivity.createdAt) < thirtyDaysAgo) score -= 15

  score = Math.max(0, Math.min(100, score))
  const healthStatus = score >= 70 ? 'healthy' : score >= 40 ? 'attention' : 'critical'
  return { score, healthStatus }
}

// ── GET /api/customers/:id/workspace ─────────────────────────────────────────
exports.getWorkspace = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
      .populate('assignedManager', 'name email avatar')
      .populate('createdBy', 'name')
      .populate('leadId', 'leadId source createdAt assignedTo')

    if (!client) return next(err('Client not found', 404))

    const cId = client._id
    const tenantId = client.tenantId

    const [
      invoiceStats, taskStats, sopStats, recentActivities, { score, healthStatus }
    ] = await Promise.all([
      Invoice.aggregate([
        { $match: { client: cId, tenantId } },
        { $group: {
          _id: null,
          total: { $sum: '$total' },
          paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$total', 0] } },
          outstanding: { $sum: '$outstanding' },
          count: { $sum: 1 },
        }},
      ]),
      Task.aggregate([
        { $match: { client: cId, tenantId } },
        { $group: {
          _id: '$status',
          count: { $sum: 1 },
        }},
      ]),
      SOPAssignment.aggregate([
        { $match: { client: cId, tenantId } },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          avgProgress: { $avg: '$progress' },
        }},
      ]),
      ClientActivity.find({ client: cId })
        .populate('performedBy', 'name avatar')
        .sort({ createdAt: -1 })
        .limit(10),
      computeHealth(cId, tenantId),
    ])

    // Update health status on client
    if (healthStatus !== client.healthStatus) {
      Client.findByIdAndUpdate(cId, { healthStatus }).catch(() => {})
    }

    // Aggregate task counts
    const taskCounts = { pending: 0, in_progress: 0, review: 0, completed: 0, total: 0 }
    taskStats.forEach(t => { taskCounts[t._id] = t.count; taskCounts.total += t.count })

    const inv = invoiceStats[0] || { total: 0, paid: 0, outstanding: 0, count: 0 }
    const sop = sopStats[0] || { total: 0, completed: 0, avgProgress: 0 }

    // Update totalRevenue and outstandingAmount on client doc
    const totalRevenue = inv.paid
    const outstanding = inv.outstanding
    Client.findByIdAndUpdate(cId, { totalRevenue, outstandingAmount: outstanding }).catch(() => {})

    res.json({
      success: true,
      data: {
        client: { ...client.toObject(), healthStatus, healthScore: score },
        stats: {
          totalRevenue: inv.paid,
          outstandingAmount: inv.outstanding,
          totalInvoiced: inv.total,
          invoiceCount: inv.count,
          tasks: taskCounts,
          sop,
          healthScore: score,
          healthStatus,
        },
        recentActivities,
      },
    })
  } catch (e) { next(e) }
}

// ── GET /api/customers/:id/timeline ──────────────────────────────────────────
exports.getTimeline = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const page = Number(req.query.page) || 1
    const limit = Math.min(Number(req.query.limit) || 30, 100)
    const skip = (page - 1) * limit

    const [activities, total] = await Promise.all([
      ClientActivity.find({ client: client._id })
        .populate('performedBy', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit),
      ClientActivity.countDocuments({ client: client._id }),
    ])

    res.json({ success: true, count: activities.length, total, page, data: activities })
  } catch (e) { next(e) }
}

// ── POST /api/customers/:id/activities ────────────────────────────────────────
exports.addActivity = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const { type = 'other', description, metadata } = req.body
    if (!description) return next(err('Description is required'))

    const activity = await ClientActivity.create({
      client: client._id,
      tenantId: client.tenantId,
      type,
      description,
      performedBy: req.user.id,
      metadata,
    })
    await Client.findByIdAndUpdate(client._id, { lastActivityAt: new Date() })

    res.status(201).json({ success: true, data: activity })
  } catch (e) { next(e) }
}

// ── INVOICES ──────────────────────────────────────────────────────────────────

exports.getInvoices = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const invoices = await Invoice.find({ client: client._id })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })

    res.json({ success: true, count: invoices.length, data: invoices })
  } catch (e) { next(e) }
}

exports.createInvoice = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const tenantId = injectTenantId(req)
    const { items = [], notes, dueDate, paymentMethod } = req.body

    // Calculate totals
    let subtotal = 0, taxAmount = 0
    const processedItems = items.map(item => {
      const amount = (item.quantity || 1) * (item.unitPrice || 0)
      const tax = amount * (item.taxPercent || 0) / 100
      subtotal += amount
      taxAmount += tax
      return { ...item, amount }
    })
    const total = subtotal + taxAmount

    const invoice = await Invoice.create({
      client: client._id,
      tenantId,
      items: processedItems,
      subtotal,
      taxAmount,
      total,
      outstanding: total,
      notes,
      dueDate,
      paymentMethod,
      createdBy: req.user.id,
    })

    await logActivity(client._id, tenantId, 'invoice_created',
      `Invoice ${invoice.invoiceNumber} created for ₹${total}`, req.user.id,
      { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber, amount: total })

    await logAction({
      action: 'CREATE', module: 'customers',
      resourceId: invoice._id, resourceType: 'Invoice',
      details: { message: `Invoice created: ${invoice.invoiceNumber}`, clientId: client._id },
      performedBy: req.user.id, tenantId,
    })

    res.status(201).json({ success: true, data: invoice })
  } catch (e) { next(e) }
}

exports.updateInvoice = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const invoice = await Invoice.findOne({ _id: req.params.invoiceId })
    if (!invoice) return next(err('Invoice not found', 404))

    // Verify invoice belongs to this tenant
    const client = await Client.findOne({ _id: invoice.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    // Recalculate if items changed
    if (req.body.items) {
      let subtotal = 0, taxAmount = 0
      req.body.items = req.body.items.map(item => {
        const amount = (item.quantity || 1) * (item.unitPrice || 0)
        subtotal += amount
        taxAmount += amount * (item.taxPercent || 0) / 100
        return { ...item, amount }
      })
      req.body.subtotal = subtotal
      req.body.taxAmount = taxAmount
      req.body.total = subtotal + taxAmount
      req.body.outstanding = Math.max(0, req.body.total - (req.body.paidAmount || invoice.paidAmount || 0))
    }

    const updated = await Invoice.findByIdAndUpdate(invoice._id, req.body, { new: true, runValidators: true })
    res.json({ success: true, data: updated })
  } catch (e) { next(e) }
}

exports.markInvoicePaid = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const invoice = await Invoice.findById(req.params.invoiceId)
    if (!invoice) return next(err('Invoice not found', 404))

    const client = await Client.findOne({ _id: invoice.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    const { paidAmount, paymentMethod, paidDate } = req.body
    const paid = paidAmount !== undefined ? Number(paidAmount) : invoice.total
    const outstanding = Math.max(0, invoice.total - paid)
    const status = outstanding === 0 ? 'paid' : paid > 0 ? 'partial' : invoice.status

    const updated = await Invoice.findByIdAndUpdate(invoice._id, {
      paidAmount: paid, outstanding, status,
      paymentMethod: paymentMethod || invoice.paymentMethod,
      paidDate: paidDate || new Date(),
    }, { new: true })

    await logActivity(client._id, client.tenantId, status === 'paid' ? 'invoice_paid' : 'payment_partial',
      `Invoice ${invoice.invoiceNumber} ${status === 'paid' ? 'paid in full' : 'partially paid'} — ₹${paid}`,
      req.user.id, { invoiceId: invoice._id, amount: paid })

    // Update client outstanding amount
    const invoiceAgg = await Invoice.aggregate([
      { $match: { client: client._id, tenantId: client.tenantId } },
      { $group: { _id: null, outstanding: { $sum: '$outstanding' }, paid: { $sum: '$paidAmount' } } },
    ])
    await Client.findByIdAndUpdate(client._id, {
      outstandingAmount: invoiceAgg[0]?.outstanding || 0,
      totalRevenue: invoiceAgg[0]?.paid || 0,
    })

    res.json({ success: true, data: updated })
  } catch (e) { next(e) }
}

exports.deleteInvoice = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const invoice = await Invoice.findById(req.params.invoiceId)
    if (!invoice) return next(err('Invoice not found', 404))

    const client = await Client.findOne({ _id: invoice.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    await Invoice.findByIdAndDelete(invoice._id)
    res.json({ success: true, message: 'Invoice deleted' })
  } catch (e) { next(e) }
}

// ── QUOTATIONS ────────────────────────────────────────────────────────────────

exports.getQuotations = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const quotations = await Quotation.find({ client: client._id })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })

    res.json({ success: true, count: quotations.length, data: quotations })
  } catch (e) { next(e) }
}

exports.createQuotation = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const tenantId = injectTenantId(req)
    const { items = [], notes, validUntil } = req.body

    let subtotal = 0, taxAmount = 0
    const processedItems = items.map(item => {
      const amount = (item.quantity || 1) * (item.unitPrice || 0)
      subtotal += amount
      taxAmount += amount * (item.taxPercent || 0) / 100
      return { ...item, amount }
    })

    const quotation = await Quotation.create({
      client: client._id,
      tenantId,
      items: processedItems,
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
      notes,
      validUntil,
      createdBy: req.user.id,
    })

    await logActivity(client._id, tenantId, 'quotation_created',
      `Quotation ${quotation.quoteNumber} created for ₹${quotation.total}`, req.user.id,
      { quotationId: quotation._id })

    res.status(201).json({ success: true, data: quotation })
  } catch (e) { next(e) }
}

exports.updateQuotation = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const quote = await Quotation.findById(req.params.quoteId)
    if (!quote) return next(err('Quotation not found', 404))

    const client = await Client.findOne({ _id: quote.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    if (req.body.items) {
      let subtotal = 0, taxAmount = 0
      req.body.items = req.body.items.map(item => {
        const amount = (item.quantity || 1) * (item.unitPrice || 0)
        subtotal += amount
        taxAmount += amount * (item.taxPercent || 0) / 100
        return { ...item, amount }
      })
      req.body.subtotal = subtotal
      req.body.taxAmount = taxAmount
      req.body.total = subtotal + taxAmount
    }

    const updated = await Quotation.findByIdAndUpdate(quote._id, req.body, { new: true })

    if (req.body.status === 'approved') {
      await logActivity(client._id, client.tenantId, 'quotation_approved',
        `Quotation ${quote.quoteNumber} approved`, req.user.id, { quotationId: quote._id })
    }

    res.json({ success: true, data: updated })
  } catch (e) { next(e) }
}

exports.convertQuotation = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const quote = await Quotation.findById(req.params.quoteId)
    if (!quote) return next(err('Quotation not found', 404))

    const client = await Client.findOne({ _id: quote.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    if (quote.convertedInvoiceId) return next(err('Already converted to invoice'))

    const tenantId = injectTenantId(req)
    const invoice = await Invoice.create({
      client: client._id,
      tenantId,
      items: quote.items,
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      total: quote.total,
      outstanding: quote.total,
      notes: quote.notes,
      dueDate: req.body.dueDate,
      createdBy: req.user.id,
    })

    await Quotation.findByIdAndUpdate(quote._id, {
      status: 'converted',
      convertedInvoiceId: invoice._id,
    })

    await logActivity(client._id, tenantId, 'quotation_converted',
      `Quotation ${quote.quoteNumber} converted to Invoice ${invoice.invoiceNumber}`,
      req.user.id, { quotationId: quote._id, invoiceId: invoice._id })

    res.json({ success: true, data: { quotation: quote, invoice } })
  } catch (e) { next(e) }
}

exports.deleteQuotation = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const quote = await Quotation.findById(req.params.quoteId)
    if (!quote) return next(err('Quotation not found', 404))

    const client = await Client.findOne({ _id: quote.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    await Quotation.findByIdAndDelete(quote._id)
    res.json({ success: true, message: 'Quotation deleted' })
  } catch (e) { next(e) }
}

// ── CUSTOMER TASKS ────────────────────────────────────────────────────────────

exports.getTasks = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const tasks = await Task.find({ client: client._id, tenantId: client.tenantId })
      .populate('assignedTo', 'name avatar')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })

    res.json({ success: true, count: tasks.length, data: tasks })
  } catch (e) { next(e) }
}

exports.createTask = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const tenantId = injectTenantId(req)
    const task = await Task.create({
      ...req.body,
      client: client._id,
      tenantId,
      createdBy: req.user.id,
    })

    await logActivity(client._id, tenantId, 'task_created',
      `Task "${task.title}" created`, req.user.id, { taskId: task._id })

    const populated = await Task.findById(task._id).populate('assignedTo', 'name avatar')
    res.status(201).json({ success: true, data: populated })
  } catch (e) { next(e) }
}

exports.updateTask = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const task = await Task.findById(req.params.taskId)
    if (!task) return next(err('Task not found', 404))

    const client = await Client.findOne({ _id: task.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    if (req.body.status === 'completed' && task.status !== 'completed') {
      req.body.completedAt = new Date()
      await logActivity(client._id, client.tenantId, 'task_completed',
        `Task "${task.title}" completed`, req.user.id, { taskId: task._id })
    }

    const updated = await Task.findByIdAndUpdate(task._id, req.body, { new: true })
      .populate('assignedTo', 'name avatar')

    res.json({ success: true, data: updated })
  } catch (e) { next(e) }
}

// ── SOP ASSIGNMENTS ───────────────────────────────────────────────────────────

exports.getSOPProgress = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const assignments = await SOPAssignment.find({ client: client._id, tenantId: client.tenantId })
      .populate('sop', 'title department sopType')
      .populate('assignedTo', 'name avatar')
      .populate('assignedBy', 'name')
      .sort({ createdAt: -1 })

    res.json({ success: true, count: assignments.length, data: assignments })
  } catch (e) { next(e) }
}

// ── NOTES ─────────────────────────────────────────────────────────────────────

exports.getNotes = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const notes = await ClientNote.find({ client: client._id })
      .populate('author', 'name avatar')
      .sort({ pinned: -1, createdAt: -1 })

    res.json({ success: true, count: notes.length, data: notes })
  } catch (e) { next(e) }
}

exports.createNote = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    if (!req.body.content) return next(err('Content is required'))

    const tenantId = injectTenantId(req)
    const note = await ClientNote.create({
      client: client._id,
      tenantId,
      content: req.body.content,
      author: req.user.id,
    })

    await logActivity(client._id, tenantId, 'note_added',
      `Note added by ${req.user.name}`, req.user.id)

    const populated = await ClientNote.findById(note._id).populate('author', 'name avatar')
    res.status(201).json({ success: true, data: populated })
  } catch (e) { next(e) }
}

exports.updateNote = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const note = await ClientNote.findById(req.params.noteId)
    if (!note) return next(err('Note not found', 404))

    const client = await Client.findOne({ _id: note.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    // Save edit history
    const editEntry = { content: note.content, editedBy: req.user.id, editedAt: new Date() }
    note.editHistory.push(editEntry)

    if (req.body.content !== undefined) note.content = req.body.content
    if (req.body.pinned !== undefined) note.pinned = req.body.pinned
    await note.save()

    const populated = await ClientNote.findById(note._id).populate('author', 'name avatar')
    res.json({ success: true, data: populated })
  } catch (e) { next(e) }
}

exports.deleteNote = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const note = await ClientNote.findById(req.params.noteId)
    if (!note) return next(err('Note not found', 404))

    const client = await Client.findOne({ _id: note.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    await ClientNote.findByIdAndDelete(note._id)
    await logActivity(client._id, client.tenantId, 'note_deleted',
      `Note deleted by ${req.user.name}`, req.user.id)

    res.json({ success: true, message: 'Note deleted' })
  } catch (e) { next(e) }
}

// ── FILES ─────────────────────────────────────────────────────────────────────

exports.getFiles = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const folder = req.query.folder || undefined
    const query = { client: client._id }
    if (folder) query.folder = folder

    const files = await ClientFile.find(query)
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })

    res.json({ success: true, count: files.length, data: files })
  } catch (e) { next(e) }
}

exports.addFile = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const { name, fileUrl, fileType, size, folder } = req.body
    if (!name || !fileUrl) return next(err('name and fileUrl are required'))

    const tenantId = injectTenantId(req)
    const file = await ClientFile.create({
      client: client._id,
      tenantId,
      name, fileUrl, fileType, size, folder,
      uploadedBy: req.user.id,
    })

    await logActivity(client._id, tenantId, 'file_uploaded',
      `File "${name}" uploaded to ${folder || 'general'}`, req.user.id,
      { fileId: file._id, folder })

    const populated = await ClientFile.findById(file._id).populate('uploadedBy', 'name')
    res.status(201).json({ success: true, data: populated })
  } catch (e) { next(e) }
}

exports.deleteFile = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const file = await ClientFile.findById(req.params.fileId)
    if (!file) return next(err('File not found', 404))

    const client = await Client.findOne({ _id: file.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    await ClientFile.findByIdAndDelete(file._id)
    await logActivity(client._id, client.tenantId, 'file_deleted',
      `File "${file.name}" deleted`, req.user.id)

    res.json({ success: true, message: 'File deleted' })
  } catch (e) { next(e) }
}

// ── MEETINGS ──────────────────────────────────────────────────────────────────

exports.getMeetings = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const meetings = await Meeting.find({ client: client._id })
      .populate('createdBy', 'name')
      .sort({ date: -1 })

    res.json({ success: true, count: meetings.length, data: meetings })
  } catch (e) { next(e) }
}

exports.createMeeting = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const tenantId = injectTenantId(req)
    const meeting = await Meeting.create({
      ...req.body,
      client: client._id,
      tenantId,
      createdBy: req.user.id,
    })

    await logActivity(client._id, tenantId, 'meeting_scheduled',
      `Meeting "${meeting.title}" scheduled for ${new Date(meeting.date).toLocaleDateString()}`,
      req.user.id, { meetingId: meeting._id })

    res.status(201).json({ success: true, data: meeting })
  } catch (e) { next(e) }
}

exports.updateMeeting = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const meeting = await Meeting.findById(req.params.meetingId)
    if (!meeting) return next(err('Meeting not found', 404))

    const client = await Client.findOne({ _id: meeting.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    const updated = await Meeting.findByIdAndUpdate(meeting._id, req.body, { new: true })

    if (req.body.status === 'completed' && meeting.status !== 'completed') {
      await logActivity(client._id, client.tenantId, 'meeting_completed',
        `Meeting "${meeting.title}" completed`, req.user.id, { meetingId: meeting._id })
    }

    res.json({ success: true, data: updated })
  } catch (e) { next(e) }
}

exports.deleteMeeting = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const meeting = await Meeting.findById(req.params.meetingId)
    if (!meeting) return next(err('Meeting not found', 404))

    const client = await Client.findOne({ _id: meeting.client, ...tf })
    if (!client) return next(err('Not authorized', 403))

    await Meeting.findByIdAndDelete(meeting._id)
    res.json({ success: true, message: 'Meeting deleted' })
  } catch (e) { next(e) }
}

// ── LEAD HISTORY ──────────────────────────────────────────────────────────────

exports.getLeadHistory = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
      .populate('leadId', 'leadId name company phone email source status priority value tags createdAt closedAt assignedTo campaign notes lostReason followUpDate')
    if (!client) return next(err('Client not found', 404))

    // Also search for lead by convertedClientId
    let lead = client.leadId
    if (!lead) {
      lead = await Lead.findOne({ convertedClientId: client._id, ...{ tenantId: tf.tenantId } })
        .populate('assignedTo', 'name email avatar')
        .populate('campaign', 'name')
    }

    res.json({ success: true, data: { client: client.toObject(), lead } })
  } catch (e) { next(e) }
}

// ── COMMUNICATION ─────────────────────────────────────────────────────────────

exports.getCommunication = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
      .populate('communicationLogs.createdBy', 'name avatar')
    if (!client) return next(err('Client not found', 404))

    // Combine existing comm logs + client activities of comm types
    const commActivities = await ClientActivity.find({
      client: client._id,
      type: { $in: ['call_made', 'whatsapp_sent', 'email_sent', 'sms_sent', 'meeting_scheduled', 'meeting_completed'] },
    })
      .populate('performedBy', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(100)

    const logs = client.communicationLogs.sort((a, b) => new Date(b.date) - new Date(a.date))

    res.json({ success: true, data: { logs, activities: commActivities } })
  } catch (e) { next(e) }
}

exports.addCommunicationEntry = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const { type = 'note', subject, content } = req.body
    client.communicationLogs.push({ type, subject, content, createdBy: req.user.id, date: new Date() })
    await client.save()

    const activityTypeMap = { call: 'call_made', email: 'email_sent', meeting: 'meeting_scheduled', note: 'other' }
    await logActivity(client._id, client.tenantId, activityTypeMap[type] || 'other',
      `${type === 'call' ? 'Call' : type === 'email' ? 'Email' : 'Communication'} logged: ${subject || content?.substring(0, 50)}`,
      req.user.id)

    res.status(201).json({ success: true, data: client.communicationLogs.slice(-1)[0] })
  } catch (e) { next(e) }
}

// ── REPORTS ───────────────────────────────────────────────────────────────────

exports.getReports = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const cId = client._id
    const tenantId = client.tenantId

    const [invoiceStats, taskStats, sopStats, paymentMonthly] = await Promise.all([
      Invoice.aggregate([
        { $match: { client: cId, tenantId } },
        { $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$total' },
          paid: { $sum: '$paidAmount' },
        }},
      ]),
      Task.aggregate([
        { $match: { client: cId, tenantId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      SOPAssignment.aggregate([
        { $match: { client: cId, tenantId } },
        { $group: { _id: '$status', count: { $sum: 1 }, avgProgress: { $avg: '$progress' } } },
      ]),
      Invoice.aggregate([
        { $match: { client: cId, tenantId, status: { $in: ['paid', 'partial'] } } },
        { $group: {
          _id: { year: { $year: '$paidDate' }, month: { $month: '$paidDate' } },
          revenue: { $sum: '$paidAmount' },
          count: { $sum: 1 },
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        { $limit: 12 },
      ]),
    ])

    // Format invoice stats
    const invoiceSummary = {}
    invoiceStats.forEach(i => { invoiceSummary[i._id] = { count: i.count, total: i.total, paid: i.paid } })

    const taskSummary = {}
    taskStats.forEach(t => { taskSummary[t._id] = t.count })

    const sopSummary = {}
    sopStats.forEach(s => { sopSummary[s._id] = { count: s.count, avgProgress: Math.round(s.avgProgress || 0) } })

    const monthlyRevenue = paymentMonthly.map(m => ({
      month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
      revenue: m.revenue,
      count: m.count,
    }))

    res.json({
      success: true,
      data: {
        invoices: invoiceSummary,
        tasks: taskSummary,
        sop: sopSummary,
        monthlyRevenue,
      },
    })
  } catch (e) { next(e) }
}

// ── HEALTH ────────────────────────────────────────────────────────────────────

exports.getHealth = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const client = await Client.findOne({ _id: req.params.id, ...tf })
    if (!client) return next(err('Client not found', 404))

    const { score, healthStatus } = await computeHealth(client._id, client.tenantId)

    // Persist
    await Client.findByIdAndUpdate(client._id, { healthStatus })

    res.json({ success: true, data: { score, healthStatus, clientId: client._id } })
  } catch (e) { next(e) }
}
