/**
 * searchController.js — Universal Search
 * Searches across Leads, Clients, Tasks, Invoices, Quotations, SOPs, Meetings, Users
 */

const Lead     = require('../models/Lead')
const Client   = require('../models/Client')
const Task     = require('../models/Task')
const Invoice  = require('../models/Invoice')
const Quotation = require('../models/Quotation')
const SOP      = require('../models/SOP')
const Meeting  = require('../models/Meeting')
const User     = require('../models/User')
const { getTenantFilter } = require('../middleware/auth')

const ROLE_LEVELS = {
  platform_super_admin: 100, client_super_admin: 80, super_admin: 80,
  admin: 60, manager: 40, employee: 20, viewer: 10,
}

function rl(role) { return ROLE_LEVELS[role] || 0 }

// ── GET /api/search?q=... ─────────────────────────────────────────────────────
exports.globalSearch = async (req, res, next) => {
  try {
    const { q = '', limit = 5, types } = req.query
    const trimmed = q.trim()
    if (trimmed.length < 2) return res.json({ success: true, data: [], query: trimmed })

    const tf = getTenantFilter(req)
    const regex = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const lim   = Math.min(Number(limit), 8)
    const role  = req.user?.role || 'employee'
    const userLevel = rl(role)

    const requestedTypes = types ? types.split(',') : ['leads','clients','tasks','invoices','quotations','sops','meetings','team']

    const run = async (type, fn) => requestedTypes.includes(type) ? fn() : []

    const [leads, clients, tasks, invoices, quotations, sops, meetings, team] = await Promise.all([
      run('leads', () => userLevel >= 20 ? Lead.find({
        ...tf,
        $or: [{ name: regex }, { email: regex }, { phone: regex }, { company: regex }],
      }).select('name email phone company status source').limit(lim).lean() : []),

      run('clients', () => userLevel >= 40 ? Client.find({
        ...tf,
        $or: [{ companyName: regex }, { contactPerson: regex }, { email: regex }, { phone: regex }],
      }).select('companyName contactPerson email phone status').limit(lim).lean() : []),

      run('tasks', () => Task.find({
        ...tf,
        title: regex,
        ...(userLevel < 40 ? { assignedTo: req.user._id } : {}),
      }).populate('client', 'companyName').select('title status priority dueDate client').limit(lim).lean()),

      run('invoices', () => userLevel >= 40 ? Invoice.find({
        ...tf,
        $or: [{ invoiceNumber: regex }],
      }).populate('client', 'companyName').select('invoiceNumber status total client dueDate').limit(lim).lean() : []),

      run('quotations', () => userLevel >= 40 ? Quotation.find({
        ...tf,
        $or: [{ quoteNumber: regex }],
      }).populate('client', 'companyName').select('quoteNumber status total client').limit(lim).lean() : []),

      run('sops', () => SOP.find({
        ...tf,
        $or: [{ title: regex }, { description: regex }],
      }).select('title department category status isTemplate').limit(lim).lean()),

      run('meetings', () => Meeting.find({
        ...tf,
        title: regex,
      }).populate('client', 'companyName').select('title date status client duration').limit(lim).lean()),

      run('team', () => userLevel >= 40 ? User.find({
        ...tf,
        $or: [{ name: regex }, { email: regex }],
        role: { $ne: 'platform_super_admin' },
      }).select('name email role isActive').limit(lim).lean() : []),
    ])

    const results = [
      ...leads.map(l => ({
        type: 'lead', id: l._id,
        title: l.name || '(no name)',
        subtitle: [l.email, l.company].filter(Boolean).join(' · '),
        status: l.status, source: l.source,
        url: '/crm-leads',
        openUrl: `/crm-leads?highlight=${l._id}`,
      })),
      ...clients.map(c => ({
        type: 'client', id: c._id,
        title: c.companyName,
        subtitle: [c.contactPerson, c.email].filter(Boolean).join(' · '),
        status: c.status,
        url: `/clients/${c._id}`,
        openUrl: `/clients/${c._id}`,
      })),
      ...tasks.map(t => ({
        type: 'task', id: t._id,
        title: t.title,
        subtitle: [t.client?.companyName, t.priority].filter(Boolean).join(' · '),
        status: t.status,
        url: '/tasks',
        openUrl: '/tasks',
        dueDate: t.dueDate,
      })),
      ...invoices.map(i => ({
        type: 'invoice', id: i._id,
        title: i.invoiceNumber,
        subtitle: i.client?.companyName,
        status: i.status,
        amount: i.total,
        url: '/finance?tab=invoices',
        openUrl: '/finance?tab=invoices',
      })),
      ...quotations.map(q => ({
        type: 'quotation', id: q._id,
        title: q.quoteNumber,
        subtitle: q.client?.companyName,
        status: q.status,
        amount: q.total,
        url: '/finance?tab=quotations',
        openUrl: '/finance?tab=quotations',
      })),
      ...sops.map(s => ({
        type: 'sop', id: s._id,
        title: s.title,
        subtitle: [s.department, s.category].filter(Boolean).join(' · '),
        status: s.status,
        isTemplate: s.isTemplate,
        url: '/sop',
        openUrl: '/sop',
      })),
      ...meetings.map(m => ({
        type: 'meeting', id: m._id,
        title: m.title,
        subtitle: m.client?.companyName,
        status: m.status,
        date: m.date,
        url: '/operations',
        openUrl: '/operations?tab=meetings',
      })),
      ...team.map(u => ({
        type: 'team', id: u._id,
        title: u.name,
        subtitle: [u.email, u.role?.replace(/_/g,' ')].filter(Boolean).join(' · '),
        status: u.isActive ? 'active' : 'inactive',
        url: '/team',
        openUrl: '/team',
      })),
    ]

    res.json({ success: true, data: results, query: trimmed, count: results.length })
  } catch (e) { next(e) }
}
