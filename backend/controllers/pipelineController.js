const Lead = require('../models/Lead')
const LeadActivity = require('../models/LeadActivity')
const FollowUp = require('../models/FollowUp')
const Client = require('../models/Client')
const Notification = require('../models/Notification')
const User = require('../models/User')
const { getTenantFilter, injectTenantId } = require('../middleware/auth')
const { logAction } = require('../utils/auditLogger')

const PIPELINE_STAGES = ['new_lead', 'contacted', 'discovery_call', 'proposal_sent', 'negotiation', 'won', 'lost']

// ── Helper: log activity (fire-and-forget) ────────────────────────────────────
async function logActivity(leadId, tenantId, type, description, userId, extra = {}) {
  try {
    await LeadActivity.create({ lead: leadId, tenantId, type, description, performedBy: userId, ...extra })
  } catch (_) {}
}

// ── GET /api/pipeline/kanban ──────────────────────────────────────────────────
exports.getKanban = async (req, res) => {
  const { search, assignedTo, source, priority, tag, expectedCloseBefore, expectedCloseAfter } = req.query
  const tf = getTenantFilter(req)
  const filter = { ...tf, status: { $in: PIPELINE_STAGES } }

  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { company: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
    { leadId: { $regex: search, $options: 'i' } },
  ]
  if (assignedTo) filter.assignedTo = assignedTo
  if (source) filter.source = source
  if (priority) filter.priority = priority
  if (tag) filter.tags = tag
  if (expectedCloseBefore || expectedCloseAfter) {
    filter.expectedCloseDate = {}
    if (expectedCloseBefore) filter.expectedCloseDate.$lte = new Date(expectedCloseBefore)
    if (expectedCloseAfter) filter.expectedCloseDate.$gte = new Date(expectedCloseAfter)
  }

  const leads = await Lead.find(filter)
    .populate('assignedTo', 'name avatar')
    .populate('createdBy', 'name')
    .sort({ kanbanOrder: 1, createdAt: -1 })

  // Attach next pending follow-up per lead
  const leadIds = leads.map(l => l._id)
  const followUps = await FollowUp.find({
    lead: { $in: leadIds },
    status: 'pending',
  }).sort({ scheduledAt: 1 })

  const nextFollowUpMap = {}
  followUps.forEach(fu => {
    const key = String(fu.lead)
    if (!nextFollowUpMap[key]) nextFollowUpMap[key] = fu
  })

  const kanban = {}
  PIPELINE_STAGES.forEach(s => { kanban[s] = { leads: [], count: 0, totalValue: 0 } })

  leads.forEach(l => {
    const stage = kanban[l.status]
    if (!stage) return
    const lObj = l.toObject()
    lObj.nextFollowUp = nextFollowUpMap[String(l._id)] || null
    stage.leads.push(lObj)
    stage.count++
    stage.totalValue += l.value || 0
  })

  res.json({ success: true, data: kanban })
}

// ── GET /api/pipeline — list view ─────────────────────────────────────────────
exports.getLeads = async (req, res) => {
  const { page = 1, limit = 20, search, status, priority, assignedTo } = req.query
  const tf = getTenantFilter(req)
  const filter = { ...tf }
  if (status && status !== 'all') filter.status = status
  if (priority) filter.priority = priority
  if (assignedTo) filter.assignedTo = assignedTo
  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { company: { $regex: search, $options: 'i' } },
    { email: { $regex: search, $options: 'i' } },
  ]
  const [data, total] = await Promise.all([
    Lead.find(filter).populate('assignedTo', 'name avatar').sort({ createdAt: -1 }).skip((page-1)*limit).limit(Number(limit)),
    Lead.countDocuments(filter),
  ])
  res.json({ success: true, data, total, page: Number(page) })
}

// ── GET /api/pipeline/summary ─────────────────────────────────────────────────
exports.getSummary = async (req, res) => {
  const tf = getTenantFilter(req)
  const counts = await Promise.all(PIPELINE_STAGES.map(s => Lead.countDocuments({ status: s, ...tf })))
  const totalValue = await Lead.aggregate([{ $match: { ...tf } }, { $group: { _id: null, total: { $sum: '$value' } } }])
  const wonValue = await Lead.aggregate([{ $match: { status: 'won', ...tf } }, { $group: { _id: null, total: { $sum: '$value' } } }])
  const summary = {}
  PIPELINE_STAGES.forEach((s, i) => { summary[s] = counts[i] })
  res.json({
    success: true,
    data: {
      ...summary,
      totalPipelineValue: totalValue[0]?.total || 0,
      wonValue: wonValue[0]?.total || 0,
    }
  })
}

// ── GET /api/pipeline/analytics ───────────────────────────────────────────────
exports.getAnalytics = async (req, res) => {
  const tf = getTenantFilter(req)

  const [
    totalLeads,
    byStage,
    wonLeads,
    lostLeads,
    conversionData,
    avgDealSize,
    lostReasons,
    recentActivity,
  ] = await Promise.all([
    Lead.countDocuments({ ...tf, status: { $in: PIPELINE_STAGES } }),

    Lead.aggregate([
      { $match: { ...tf, status: { $in: PIPELINE_STAGES } } },
      { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$value' } } },
    ]),

    Lead.aggregate([
      { $match: { ...tf, status: 'won' } },
      { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$value' }, avgCycle: { $avg: { $subtract: ['$closedAt', '$createdAt'] } } } },
    ]),

    Lead.aggregate([
      { $match: { ...tf, status: 'lost' } },
      { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$value' } } },
    ]),

    Lead.aggregate([
      { $match: { ...tf } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
        lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
      }}
    ]),

    Lead.aggregate([
      { $match: { ...tf, status: { $in: PIPELINE_STAGES }, value: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$value' }, total: { $sum: '$value' } } },
    ]),

    Lead.aggregate([
      { $match: { ...tf, status: 'lost', lostReason: { $nin: ['', null] } } },
      { $group: { _id: '$lostReason', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    LeadActivity.find({ tenantId: tf.tenantId })
      .populate('performedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(20),
  ])

  const stageMap = {}
  PIPELINE_STAGES.forEach(s => { stageMap[s] = { count: 0, value: 0 } })
  byStage.forEach(b => { if (stageMap[b._id]) stageMap[b._id] = { count: b.count, value: b.value } })

  const totalClosed = (wonLeads[0]?.count || 0) + (lostLeads[0]?.count || 0)
  const conversionRate = totalClosed > 0
    ? Math.round((wonLeads[0]?.count || 0) / totalClosed * 100)
    : 0

  // Avg sales cycle in days
  const avgCycleMs = wonLeads[0]?.avgCycle || 0
  const avgSaleCycleDays = avgCycleMs > 0 ? Math.round(avgCycleMs / (1000 * 60 * 60 * 24)) : 0

  res.json({
    success: true,
    data: {
      totalLeads,
      pipelineValue: avgDealSize[0]?.total || 0,
      avgDealSize: Math.round(avgDealSize[0]?.avg || 0),
      conversionRate,
      wonRevenue: wonLeads[0]?.value || 0,
      wonCount: wonLeads[0]?.count || 0,
      lostRevenue: lostLeads[0]?.value || 0,
      lostCount: lostLeads[0]?.count || 0,
      avgSaleCycleDays,
      byStage: stageMap,
      lostReasons,
      recentActivity,
    }
  })
}

// ── GET /api/pipeline/forecast ────────────────────────────────────────────────
exports.getForecasting = async (req, res) => {
  const tf = getTenantFilter(req)

  // Stage win probability defaults
  const STAGE_PROBABILITY = {
    new_lead: 5,
    contacted: 15,
    discovery_call: 30,
    proposal_sent: 50,
    negotiation: 70,
    won: 100,
    lost: 0,
  }

  const leads = await Lead.find({
    ...tf,
    status: { $in: PIPELINE_STAGES.filter(s => !['won', 'lost'].includes(s)) },
    value: { $gt: 0 },
  }).select('status value expectedCloseDate createdAt')

  let projectedRevenue = 0   // all active leads × stage probability
  let likelyRevenue = 0      // leads with >50% probability
  let thisMonthRevenue = 0

  const now = new Date()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  leads.forEach(l => {
    const prob = STAGE_PROBABILITY[l.status] / 100
    const weighted = (l.value || 0) * prob
    projectedRevenue += weighted
    if (prob > 0.5) likelyRevenue += l.value || 0
    if (l.expectedCloseDate && new Date(l.expectedCloseDate) <= monthEnd) {
      thisMonthRevenue += weighted
    }
  })

  // Monthly breakdown — leads with expectedCloseDate
  const monthlyMap = {}
  leads.forEach(l => {
    if (!l.expectedCloseDate) return
    const d = new Date(l.expectedCloseDate)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!monthlyMap[key]) monthlyMap[key] = 0
    monthlyMap[key] += (l.value || 0) * (STAGE_PROBABILITY[l.status] / 100)
  })

  const monthly = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 6)
    .map(([month, value]) => ({ month, value: Math.round(value) }))

  res.json({
    success: true,
    data: {
      projectedRevenue: Math.round(projectedRevenue),
      likelyRevenue: Math.round(likelyRevenue),
      expectedThisMonth: Math.round(thisMonthRevenue),
      monthly,
    }
  })
}

// ── POST /api/pipeline ────────────────────────────────────────────────────────
exports.createLead = async (req, res) => {
  const tenantId = injectTenantId(req)
  const lead = await Lead.create({ ...req.body, createdBy: req.user._id, tenantId })
  await lead.populate('assignedTo', 'name avatar')

  await logActivity(lead._id, tenantId, 'lead_created',
    `Lead added to pipeline by ${req.user.name}`, req.user.id)

  if (lead.assignedTo?.length) {
    await Notification.insertMany(lead.assignedTo.map(u => ({
      recipient: u._id,
      type: 'lead',
      title: 'New Lead Assigned',
      message: `${lead.name} (${lead.company || ''}) added to pipeline`,
      link: '/pipeline',
      tenantId,
    }))).catch(() => {})
  }

  res.status(201).json({ success: true, data: lead })
}

// ── PUT /api/pipeline/:id ─────────────────────────────────────────────────────
exports.updateLead = async (req, res) => {
  const tf = getTenantFilter(req)
  const old = await Lead.findOne({ _id: req.params.id, ...tf })
  if (!old) return res.status(404).json({ success: false, message: 'Lead not found' })

  const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    .populate('assignedTo', 'name avatar')

  const tenantId = old.tenantId

  if (req.body.value !== undefined && req.body.value !== old.value) {
    await logActivity(lead._id, tenantId, 'value_updated',
      `Deal value updated to ₹${req.body.value}`, req.user.id,
      { oldValue: String(old.value), newValue: String(req.body.value) })
  }
  if (req.body.priority && req.body.priority !== old.priority) {
    await logActivity(lead._id, tenantId, 'priority_changed',
      `Priority changed from ${old.priority} to ${req.body.priority}`, req.user.id,
      { oldValue: old.priority, newValue: req.body.priority })
  }

  res.json({ success: true, data: lead })
}

// ── PUT /api/pipeline/:id/move — drag-and-drop stage change ──────────────────
exports.moveLead = async (req, res) => {
  const { status, kanbanOrder, lostReason } = req.body
  const tf = getTenantFilter(req)

  // Require lost reason when moving to 'lost'
  if (status === 'lost' && !lostReason) {
    return res.status(400).json({ success: false, message: 'Lost reason is required' })
  }

  const old = await Lead.findOne({ _id: req.params.id, ...tf })
  if (!old) return res.status(404).json({ success: false, message: 'Lead not found' })

  const update = { status, kanbanOrder }
  if (status === 'lost') {
    update.lostReason = lostReason
    update.closedAt = new Date()
  }
  if (status === 'won') {
    update.closedAt = new Date()
  }

  const lead = await Lead.findByIdAndUpdate(req.params.id, update, { new: true })
    .populate('assignedTo', 'name avatar')

  // Log activity
  if (old.status !== status) {
    const type = status === 'won' ? 'status_changed' :
                 status === 'lost' ? 'lost' :
                 'pipeline_moved'
    await logActivity(lead._id, old.tenantId, type,
      `Stage moved from ${old.status} to ${status}${lostReason ? ` (reason: ${lostReason})` : ''}`,
      req.user.id, { oldValue: old.status, newValue: status })
  }

  res.json({ success: true, data: lead })
}

// ── POST /api/pipeline/:id/convert — Won lead → create Client ─────────────────
exports.convertToClient = async (req, res) => {
  const tf = getTenantFilter(req)
  const lead = await Lead.findOne({ _id: req.params.id, ...tf })
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' })
  if (lead.status !== 'won') {
    return res.status(400).json({ success: false, message: 'Only won leads can be converted' })
  }
  if (lead.convertedClientId) {
    return res.status(400).json({ success: false, message: 'Already converted to client' })
  }

  const tenantId = injectTenantId(req)

  const client = await Client.create({
    companyName: lead.company || lead.name,
    brandName: lead.brandName || '',
    contactPerson: lead.name,
    phone: lead.phone,
    email: lead.email,
    website: lead.website || '',
    industry: lead.industry || '',
    status: 'active',
    assignedManager: lead.assignedTo?.[0],
    createdBy: req.user._id,
    tenantId,
    monthlyRetainer: lead.value || 0,
  })

  lead.convertedClientId = client._id
  lead.status = 'converted'
  await lead.save()

  await logActivity(lead._id, lead.tenantId, 'converted',
    `Lead converted to client: ${client.companyName}`, req.user.id,
    { metadata: { clientId: client._id } })

  await logAction({
    action: 'CONVERT', module: 'pipeline',
    resourceId: lead._id, resourceType: 'Lead',
    details: { message: `Lead ${lead.name} converted to client`, clientId: client._id },
    performedBy: req.user.id, tenantId,
  })

  // Notify admins
  const admins = await User.find({ role: { $in: ['super_admin', 'admin'] }, isActive: true, ...tf })
  await Notification.insertMany(admins.map(a => ({
    recipient: a._id,
    type: 'client',
    title: 'Lead Converted to Client',
    message: `${lead.company || lead.name} is now a client!`,
    link: `/clients/${client._id}`,
    tenantId,
  }))).catch(() => {})

  res.json({ success: true, data: { lead, client }, message: 'Client profile created successfully' })
}

// ── DELETE /api/pipeline/:id ──────────────────────────────────────────────────
exports.deleteLead = async (req, res) => {
  const tf = getTenantFilter(req)
  const lead = await Lead.findOneAndDelete({ _id: req.params.id, ...tf })
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' })

  await Promise.all([
    FollowUp.deleteMany({ lead: lead._id }),
    LeadActivity.deleteMany({ lead: lead._id }),
  ]).catch(() => {})

  res.json({ success: true, message: 'Lead deleted' })
}

// ── GET /api/pipeline/export ──────────────────────────────────────────────────
exports.exportLeads = async (req, res) => {
  const tf = getTenantFilter(req)
  const leads = await Lead.find(tf).populate('assignedTo', 'name').sort({ createdAt: -1 })
  const headers = ['Lead ID', 'Name', 'Company', 'Phone', 'Email', 'Website', 'Industry',
    'Status', 'Priority', 'Deal Value', 'Source', 'Assigned To', 'Tags', 'Expected Close', 'Lost Reason', 'Created']
  const rows = leads.map(l => [
    l.leadId || '',
    l.name, l.company, l.phone, l.email, l.website, l.industry,
    l.status.replace(/_/g, ' '), l.priority, l.value || 0,
    l.source, l.assignedTo?.map(u => u.name).join('; ') || '',
    l.tags?.join(', ') || '',
    l.expectedCloseDate ? new Date(l.expectedCloseDate).toLocaleDateString() : '',
    l.lostReason || '',
    new Date(l.createdAt).toLocaleDateString(),
  ])
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="pipeline-${Date.now()}.csv"`)
  res.send(csv)
}

// ── POST /api/pipeline/bulk ───────────────────────────────────────────────────
exports.pipelineBulkAction = async (req, res) => {
  const { action, ids, value } = req.body
  if (!action || !ids?.length) return res.status(400).json({ success: false, message: 'action and ids required' })

  const tf = getTenantFilter(req)
  const filter = { _id: { $in: ids }, ...tf }
  let result

  switch (action) {
    case 'delete':
      if (!['super_admin', 'admin', 'manager'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Not authorized' })
      }
      result = await Lead.deleteMany(filter)
      await Promise.all([
        FollowUp.deleteMany({ lead: { $in: ids } }),
        LeadActivity.deleteMany({ lead: { $in: ids } }),
      ]).catch(() => {})
      break

    case 'stage':
      if (!value) return res.status(400).json({ success: false, message: 'value required' })
      result = await Lead.updateMany(filter, { $set: { status: value } })
      break

    case 'priority':
      if (!value) return res.status(400).json({ success: false, message: 'value required' })
      result = await Lead.updateMany(filter, { $set: { priority: value } })
      break

    case 'assign':
      if (!value) return res.status(400).json({ success: false, message: 'value required' })
      result = await Lead.updateMany(filter, { $addToSet: { assignedTo: value } })
      break

    case 'tag':
      if (!value) return res.status(400).json({ success: false, message: 'value required' })
      result = await Lead.updateMany(filter, { $addToSet: { tags: value } })
      break

    case 'archive':
      result = await Lead.updateMany(filter, { $set: { status: 'archived' } })
      break

    default:
      return res.status(400).json({ success: false, message: `Unknown action: ${action}` })
  }

  await logAction({
    action: 'BULK_UPDATE', module: 'pipeline',
    details: { message: `Bulk ${action} on ${ids.length} pipeline lead(s)`, action, count: ids.length },
    performedBy: req.user.id, tenantId: injectTenantId(req),
  })

  res.json({ success: true, affected: result?.deletedCount || result?.modifiedCount || ids.length })
}

// ── Auto-wrap all exported async functions with error forwarding ───────────────
Object.keys(exports).forEach(k => {
  const fn = exports[k]
  if (typeof fn === 'function' && fn.constructor.name === 'AsyncFunction') {
    exports[k] = async (req, res, next) => {
      try { await fn(req, res, next) } catch (err) { next(err) }
    }
  }
})
