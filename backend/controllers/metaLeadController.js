const MetaLead = require('../models/MetaLead')
const MetaCampaign = require('../models/MetaCampaign')
const User = require('../models/User')
const Notification = require('../models/Notification')
const { fetchMetaLead, fetchFormLeads, fetchPageForms, verifyWebhookSignature } = require('../utils/metaApi')
const { getTenantFilter, injectTenantId } = require('../middleware/auth')

// ─── KPIs ────────────────────────────────────────────────────────────────────
exports.getKPIs = async (req, res) => {
  const tf = getTenantFilter(req)
  const todayStart = new Date(); todayStart.setHours(0,0,0,0)

  const [total, facebook, instagram, today, qualified, converted, lost] = await Promise.all([
    MetaLead.countDocuments({ ...tf }),
    MetaLead.countDocuments({ platform: 'facebook', ...tf }),
    MetaLead.countDocuments({ platform: 'instagram', ...tf }),
    MetaLead.countDocuments({ receivedAt: { $gte: todayStart }, ...tf }),
    MetaLead.countDocuments({ status: 'qualified', ...tf }),
    MetaLead.countDocuments({ status: 'converted', ...tf }),
    MetaLead.countDocuments({ status: 'lost', ...tf }),
  ])

  const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : 0

  res.json({ success: true, data: { total, facebook, instagram, today, qualified, converted, lost, conversionRate } })
}

// ─── List Leads ───────────────────────────────────────────────────────────────
exports.getLeads = async (req, res) => {
  const { page = 1, limit = 15, search, platform, status, campaign, dateFrom, dateTo, assignedTo } = req.query
  const skip = (page - 1) * limit
  const tf = getTenantFilter(req)

  const filter = { ...tf }
  if (platform && platform !== 'all') filter.platform = platform
  if (status && status !== 'all') filter.status = status
  if (campaign) filter.campaignId = campaign
  if (assignedTo) filter.assignedTo = assignedTo
  if (dateFrom || dateTo) {
    filter.receivedAt = {}
    if (dateFrom) filter.receivedAt.$gte = new Date(dateFrom)
    if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59,999); filter.receivedAt.$lte = d }
  }
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { campaignName: { $regex: search, $options: 'i' } },
    ]
  }

  const [data, total] = await Promise.all([
    MetaLead.find(filter)
      .populate('assignedTo', 'name email avatar')
      .populate('notes.createdBy', 'name')
      .sort({ receivedAt: -1 }).skip(skip).limit(Number(limit)),
    MetaLead.countDocuments(filter),
  ])

  res.json({ success: true, data, total, page: Number(page), pages: Math.ceil(total / limit) })
}

// ─── Get Single Lead ──────────────────────────────────────────────────────────
exports.getLeadById = async (req, res) => {
  const tf = getTenantFilter(req)
  const lead = await MetaLead.findOne({ _id: req.params.id, ...tf })
    .populate('assignedTo', 'name email avatar')
    .populate('notes.createdBy', 'name avatar')
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' })
  res.json({ success: true, data: lead })
}

// ─── Create Lead (manual) ─────────────────────────────────────────────────────
exports.createLead = async (req, res) => {
  const lead = await MetaLead.create({ ...req.body, receivedAt: new Date(), tenantId: injectTenantId(req) })
  res.status(201).json({ success: true, data: lead })
}

// ─── Update Lead ──────────────────────────────────────────────────────────────
exports.updateLead = async (req, res) => {
  const tf = getTenantFilter(req)
  const lead = await MetaLead.findOneAndUpdate({ _id: req.params.id, ...tf }, req.body, { new: true, runValidators: true })
    .populate('assignedTo', 'name email avatar')
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' })
  res.json({ success: true, data: lead })
}

// ─── Delete Lead ──────────────────────────────────────────────────────────────
exports.deleteLead = async (req, res) => {
  const tf = getTenantFilter(req)
  await MetaLead.findOneAndDelete({ _id: req.params.id, ...tf })
  res.json({ success: true, message: 'Lead deleted' })
}

// ─── Add Note ─────────────────────────────────────────────────────────────────
exports.addNote = async (req, res) => {
  const tf = getTenantFilter(req)
  const lead = await MetaLead.findOne({ _id: req.params.id, ...tf })
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' })
  lead.notes.push({ text: req.body.text, createdBy: req.user._id })
  await lead.save()
  await lead.populate('notes.createdBy', 'name avatar')
  res.json({ success: true, data: lead.notes })
}

// ─── Campaign Analytics ───────────────────────────────────────────────────────
exports.getCampaignAnalytics = async (req, res) => {
  const tf = getTenantFilter(req)
  const agg = await MetaLead.aggregate([
    { $match: { ...tf } },
    { $group: {
      _id: '$campaignId',
      campaignName: { $first: '$campaignName' },
      platform: { $first: '$platform' },
      totalLeads: { $sum: 1 },
      qualifiedLeads: { $sum: { $cond: [{ $eq: ['$status', 'qualified'] }, 1, 0] } },
      convertedLeads: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
    }},
    { $sort: { totalLeads: -1 } },
  ])

  // Merge with campaign financial data
  const campaigns = await MetaCampaign.find({ ...tf })
  const campaignMap = {}
  campaigns.forEach(c => { campaignMap[c.campaignId] = c })

  const result = agg.map(row => {
    const fin = campaignMap[row._id] || {}
    const adSpend = fin.adSpend || 0
    const revenue = fin.revenueGenerated || 0
    const cpl = adSpend > 0 && row.totalLeads > 0 ? (adSpend / row.totalLeads).toFixed(2) : 0
    const roi = adSpend > 0 ? (((revenue - adSpend) / adSpend) * 100).toFixed(1) : 0
    const convRate = row.totalLeads > 0 ? ((row.convertedLeads / row.totalLeads) * 100).toFixed(1) : 0
    return { ...row, adSpend, revenueGenerated: revenue, costPerLead: Number(cpl), roi: Number(roi), conversionRate: Number(convRate), campaignDbId: fin._id }
  })

  res.json({ success: true, data: result })
}

// ─── Update Campaign Financial Data ──────────────────────────────────────────
exports.updateCampaignFinancials = async (req, res) => {
  const { campaignId, campaignName, platform, adSpend, revenueGenerated } = req.body
  const tenantId = injectTenantId(req)
  const campaign = await MetaCampaign.findOneAndUpdate(
    { campaignId, ...(tenantId ? { tenantId } : {}) },
    { campaignId, campaignName, platform, adSpend, revenueGenerated, tenantId },
    { upsert: true, new: true }
  )
  res.json({ success: true, data: campaign })
}

// ─── Export Leads ─────────────────────────────────────────────────────────────
exports.exportLeads = async (req, res) => {
  const { platform, status, dateFrom, dateTo } = req.query
  const tf = getTenantFilter(req)
  const filter = { ...tf }
  if (platform && platform !== 'all') filter.platform = platform
  if (status && status !== 'all') filter.status = status
  if (dateFrom || dateTo) {
    filter.receivedAt = {}
    if (dateFrom) filter.receivedAt.$gte = new Date(dateFrom)
    if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59,999); filter.receivedAt.$lte = d }
  }

  const leads = await MetaLead.find(filter).populate('assignedTo', 'name').sort({ receivedAt: -1 })

  const headers = ['Full Name', 'Phone', 'Email', 'Platform', 'Campaign', 'Ad Set', 'Status', 'Assigned To', 'Follow-Up Date', 'Received At']
  const rows = leads.map(l => [
    l.fullName, l.phone || '', l.email || '',
    l.platform, l.campaignName || '', l.adSetName || '',
    l.status, l.assignedTo?.name || '',
    l.followUpDate ? new Date(l.followUpDate).toLocaleDateString() : '',
    new Date(l.receivedAt).toLocaleString(),
  ])

  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="meta-leads-${Date.now()}.csv"`)
  res.send(csv)
}

// ─── Sync Leads from Meta API ─────────────────────────────────────────────────
exports.syncLeads = async (req, res) => {
  if (!process.env.META_PAGE_ACCESS_TOKEN || !process.env.META_PAGE_ID) {
    return res.status(400).json({ success: false, message: 'Meta credentials not configured. Add META_PAGE_ACCESS_TOKEN and META_PAGE_ID to .env' })
  }

  const tenantId = injectTenantId(req)

  try {
    const formsData = await fetchPageForms(process.env.META_PAGE_ID)
    let synced = 0, duplicates = 0

    for (const form of (formsData.data || [])) {
      const leadsData = await fetchFormLeads(form.id)
      for (const metaLead of (leadsData.data || [])) {
        const exists = await MetaLead.findOne({ metaLeadId: metaLead.id })
        if (exists) { duplicates++; continue }

        const { parseMetaLeadFields } = require('../utils/metaApi')
        const { fullName, phone, email } = parseMetaLeadFields(metaLead.field_data)

        await MetaLead.create({
          metaLeadId: metaLead.id,
          formId: form.id,
          adId: metaLead.ad_id,
          adSetId: metaLead.adset_id,
          campaignId: metaLead.campaign_id,
          fullName,
          phone,
          email,
          campaignName: metaLead.campaign_name || '',
          adSetName: metaLead.adset_name || '',
          adName: metaLead.ad_name || '',
          platform: metaLead.platform === 'ig' ? 'instagram' : 'facebook',
          receivedAt: metaLead.created_time ? new Date(metaLead.created_time) : new Date(),
          rawData: metaLead,
          tenantId,
        })
        synced++
      }
    }

    res.json({ success: true, message: `Synced ${synced} new leads. ${duplicates} duplicates skipped.`, synced, duplicates })
  } catch (err) {
    res.status(500).json({ success: false, message: `Meta API error: ${err.message}` })
  }
}

// ─── Webhook Verify (GET) ─────────────────────────────────────────────────────
exports.verifyWebhook = (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Meta webhook verified')
    res.status(200).send(challenge)
  } else {
    res.status(403).json({ error: 'Forbidden' })
  }
}

// ─── Webhook Receive (POST) ───────────────────────────────────────────────────
// Note: webhook-received leads have no tenant context; they are assigned to the
// first active super_admin's tenant automatically. Tenant scoping for Meta
// integration should be configured per-tenant in a future iteration.
exports.receiveWebhook = async (req, res) => {
  const sig = req.headers['x-hub-signature-256'] || ''
  const rawBody = req.rawBody || JSON.stringify(req.body)
  if (process.env.META_APP_SECRET && !verifyWebhookSignature(rawBody, sig)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  res.status(200).json({ received: true })

  const body = req.body
  if (!body?.entry) return

  for (const entry of body.entry) {
    for (const change of (entry.changes || [])) {
      if (change.field !== 'leadgen') continue
      const leadId = change.value?.leadgen_id
      if (!leadId) continue

      try {
        const exists = await MetaLead.findOne({ metaLeadId: leadId })
        if (exists) continue

        const leadData = await fetchMetaLead(leadId)
        const lead = await MetaLead.create(leadData)

        // Auto-assign to least-loaded active employee
        const employees = await User.find({ isActive: true, role: { $in: ['employee', 'manager'] } })
        if (employees.length > 0) {
          const counts = await Promise.all(employees.map(e => MetaLead.countDocuments({ assignedTo: e._id, status: { $nin: ['converted', 'lost'] } })))
          const minIdx = counts.indexOf(Math.min(...counts))
          lead.assignedTo = employees[minIdx]._id
          await lead.save()

          await Notification.create({
            recipient: employees[minIdx]._id,
            type: 'lead',
            title: 'New Meta Lead Assigned',
            message: `New ${leadData.platform} lead: ${leadData.fullName} from ${leadData.campaignName || 'Unknown Campaign'}`,
            link: '/leads',
          })
        }

        const admins = await User.find({ role: { $in: ['super_admin', 'admin'] }, isActive: true })
        await Notification.insertMany(admins.map(a => ({
          recipient: a._id,
          type: 'lead',
          title: 'New Meta Lead Received',
          message: `${leadData.platform === 'instagram' ? 'Instagram' : 'Facebook'} lead: ${leadData.fullName} – ${leadData.campaignName || ''}`,
          link: '/leads',
        })))
      } catch (err) {
        console.error('Webhook lead processing error:', err.message)
      }
    }
  }
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
