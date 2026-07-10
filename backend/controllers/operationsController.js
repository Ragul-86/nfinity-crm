/**
 * operationsController.js
 * Phase 10 — Operations Workspace
 * Handles: Calendar aggregation, Operations Dashboard, Meeting CRUD, Task duplicate
 */

const Task       = require('../models/Task')
const Meeting    = require('../models/Meeting')
const SOP        = require('../models/SOP')
const SOPAssignment = require('../models/SOPAssignment')
const Client     = require('../models/Client')
const Invoice    = require('../models/Invoice')
const FollowUp   = require('../models/FollowUp')
const User       = require('../models/User')
const { getTenantFilter, injectTenantId } = require('../middleware/auth')
const { logAction } = require('../utils/auditLogger')

// ─── Helpers ──────────────────────────────────────────────────────────────────
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function endOfDay(d)   { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999) }

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
exports.getCalendarEvents = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { dateFrom, dateTo } = req.query

    const from = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const to   = dateTo   ? new Date(dateTo)   : new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0)

    const [tasks, meetings, followUps, invoices, renewals, sopAssignments] = await Promise.all([
      Task.find({
        ...tf,
        dueDate: { $gte: from, $lte: to },
        status: { $nin: ['completed', 'cancelled'] },
      }).populate('assignedTo', 'name').populate('client', 'companyName').select('title dueDate status priority client assignedTo').lean(),

      Meeting.find({
        ...tf,
        date: { $gte: from, $lte: to },
      }).populate('client', 'companyName').populate('createdBy', 'name').select('title date duration status client lead attendees').lean(),

      FollowUp.find({
        ...tf,
        scheduledAt: { $gte: from, $lte: to },
        status: { $ne: 'completed' },
      }).populate('lead', 'name').select('title scheduledAt status lead').lean(),

      Invoice.find({
        ...tf,
        dueDate: { $gte: from, $lte: to },
        status: { $in: ['sent', 'viewed', 'partial', 'overdue'] },
      }).populate('client', 'companyName').select('invoiceNumber dueDate status total client').lean(),

      Client.find({
        ...tf,
        renewalDate: { $gte: from, $lte: to },
        status: 'active',
      }).select('companyName renewalDate packageName').lean(),

      SOPAssignment.find({
        ...tf,
        dueDate: { $gte: from, $lte: to },
        status: { $nin: ['completed', 'archived'] },
      }).populate('sop', 'title').populate('assignedTo', 'name').populate('client', 'companyName').select('sopTitle dueDate status sop assignedTo client').lean(),
    ])

    // Normalise to a flat event array
    const events = [
      ...tasks.map(t => ({
        id: t._id, type: 'task', title: t.title,
        date: t.dueDate, status: t.status, priority: t.priority,
        client: t.client?.companyName, color: 'blue',
        extra: { assignedTo: t.assignedTo?.map(u => u.name).join(', ') },
      })),
      ...meetings.map(m => ({
        id: m._id, type: 'meeting', title: m.title,
        date: m.date, status: m.status, duration: m.duration,
        client: m.client?.companyName, color: 'purple',
        extra: { attendees: m.attendees?.length || 0 },
      })),
      ...followUps.map(f => ({
        id: f._id, type: 'followup', title: f.title || 'Follow-up',
        date: f.scheduledAt, status: f.status,
        client: f.lead?.name, color: 'amber',
      })),
      ...invoices.map(i => ({
        id: i._id, type: 'invoice', title: `Invoice Due: ${i.invoiceNumber}`,
        date: i.dueDate, status: i.status,
        client: i.client?.companyName, color: 'red',
        extra: { amount: i.total },
      })),
      ...renewals.map(c => ({
        id: c._id, type: 'renewal', title: `Renewal: ${c.companyName}`,
        date: c.renewalDate, status: 'upcoming',
        client: c.companyName, color: 'green',
        extra: { package: c.packageName },
      })),
      ...sopAssignments.map(s => ({
        id: s._id, type: 'sop', title: s.sopTitle || s.sop?.title || 'SOP',
        date: s.dueDate, status: s.status,
        client: s.client?.companyName, color: 'indigo',
        extra: { assignedTo: s.assignedTo?.name },
      })),
    ]

    res.json({ success: true, data: events })
  } catch (e) { next(e) }
}

// ─── OPERATIONS DASHBOARD ─────────────────────────────────────────────────────
exports.getOperationsDashboard = async (req, res, next) => {
  try {
    const tf  = getTenantFilter(req)
    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd   = endOfDay(now)
    const next7      = new Date(now.getTime() + 7 * 86400000)

    const [
      pendingSOPs, completedSOPs, inProgressSOPs,
      pendingTasks, completedTasks, overdueTasks, inProgressTasks, blockedTasks,
      todayMeetings, upcomingMeetings,
      tasksByPriority, sopsByStatus,
      teamStats,
    ] = await Promise.all([
      SOPAssignment.countDocuments({ ...tf, status: 'not_started' }),
      SOPAssignment.countDocuments({ ...tf, status: 'completed' }),
      SOPAssignment.countDocuments({ ...tf, status: 'in_progress' }),

      Task.countDocuments({ ...tf, status: 'pending' }),
      Task.countDocuments({ ...tf, status: 'completed' }),
      Task.countDocuments({ ...tf, status: { $ne: 'completed' }, dueDate: { $lt: todayStart } }),
      Task.countDocuments({ ...tf, status: 'in_progress' }),
      Task.countDocuments({ ...tf, status: 'blocked' }),

      Meeting.countDocuments({ ...tf, date: { $gte: todayStart, $lte: todayEnd } }),
      Meeting.find({ ...tf, date: { $gte: now, $lte: next7 }, status: 'scheduled' })
        .populate('client', 'companyName').select('title date duration client').sort('date').limit(5).lean(),

      Task.aggregate([{ $match: { ...tf } }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      SOPAssignment.aggregate([{ $match: { ...tf } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),

      // Team productivity — tasks completed this month per user
      Task.aggregate([
        { $match: { ...tf, status: 'completed', completedAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } } },
        { $unwind: '$assignedTo' },
        { $group: { _id: '$assignedTo', completed: { $sum: 1 } } },
        { $sort: { completed: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { name: '$user.name', completed: 1 } },
      ]),
    ])

    res.json({
      success: true,
      data: {
        sop: { pending: pendingSOPs, completed: completedSOPs, inProgress: inProgressSOPs },
        tasks: { pending: pendingTasks, completed: completedTasks, overdue: overdueTasks, inProgress: inProgressTasks, blocked: blockedTasks },
        meetings: { today: todayMeetings, upcoming: upcomingMeetings },
        tasksByPriority,
        sopsByStatus,
        teamStats,
      },
    })
  } catch (e) { next(e) }
}

// ─── MEETINGS CRUD ────────────────────────────────────────────────────────────
exports.getMeetings = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { dateFrom, dateTo, status, clientId, limit = 50, page = 1 } = req.query
    const filter = { ...tf }
    if (status)   filter.status   = status
    if (clientId) filter.client   = clientId
    if (dateFrom || dateTo) {
      filter.date = {}
      if (dateFrom) filter.date.$gte = new Date(dateFrom)
      if (dateTo)   filter.date.$lte = new Date(dateTo)
    }
    const skip  = (Number(page) - 1) * Number(limit)
    const [meetings, total] = await Promise.all([
      Meeting.find(filter)
        .populate('client', 'companyName')
        .populate('createdBy', 'name')
        .populate('attendees.userId', 'name')
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Meeting.countDocuments(filter),
    ])
    res.json({ success: true, data: meetings, total, page: Number(page) })
  } catch (e) { next(e) }
}

exports.getMeeting = async (req, res, next) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, ...getTenantFilter(req) })
      .populate('client', 'companyName')
      .populate('createdBy', 'name')
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' })
    res.json({ success: true, data: meeting })
  } catch (e) { next(e) }
}

exports.createMeeting = async (req, res, next) => {
  try {
    const meeting = await Meeting.create({ ...req.body, createdBy: req.user.id, tenantId: injectTenantId(req) })
    logAction({ req, action: 'create_meeting', resourceType: 'Meeting', resourceId: meeting._id, details: meeting.title, performedBy: req.user.id }).catch(() => {})
    res.status(201).json({ success: true, data: meeting })
  } catch (e) { next(e) }
}

exports.updateMeeting = async (req, res, next) => {
  try {
    const meeting = await Meeting.findOneAndUpdate(
      { _id: req.params.id, ...getTenantFilter(req) },
      req.body,
      { new: true, runValidators: true }
    ).populate('client', 'companyName')
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' })
    logAction({ req, action: 'update_meeting', resourceType: 'Meeting', resourceId: meeting._id, details: meeting.title, performedBy: req.user.id }).catch(() => {})
    res.json({ success: true, data: meeting })
  } catch (e) { next(e) }
}

exports.deleteMeeting = async (req, res, next) => {
  try {
    await Meeting.findOneAndDelete({ _id: req.params.id, ...getTenantFilter(req) })
    logAction({ req, action: 'delete_meeting', resourceType: 'Meeting', resourceId: req.params.id, details: 'deleted', performedBy: req.user.id }).catch(() => {})
    res.json({ success: true, message: 'Meeting deleted' })
  } catch (e) { next(e) }
}

// ─── TASK DUPLICATE ───────────────────────────────────────────────────────────
exports.duplicateTask = async (req, res, next) => {
  try {
    const original = await Task.findOne({ _id: req.params.id, ...getTenantFilter(req) }).lean()
    if (!original) return res.status(404).json({ success: false, message: 'Task not found' })
    const { _id, createdAt, updatedAt, completedAt, comments, ...rest } = original
    const copy = await Task.create({
      ...rest,
      title: `${rest.title} (Copy)`,
      status: 'pending',
      createdBy: req.user.id,
      tenantId: injectTenantId(req),
    })
    res.status(201).json({ success: true, data: copy })
  } catch (e) { next(e) }
}

// ─── CUSTOMER OPS (aggregate SOP + tasks + meetings for a client) ─────────────
exports.getCustomerOps = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { clientId } = req.params

    // Verify client belongs to tenant
    const client = await Client.findOne({ _id: clientId, ...tf }).select('companyName').lean()
    if (!client) return res.status(404).json({ success: false, message: 'Client not found' })

    const now = new Date()
    const todayStart = startOfDay(now)

    const [sopAssignments, tasks, meetings, recentActivity] = await Promise.all([
      // SOP assignments for this client
      SOPAssignment.find({ client: clientId, ...tf })
        .populate('sop', 'title department category')
        .populate('assignedTo', 'name')
        .populate('assignedBy', 'name')
        .sort({ createdAt: -1 })
        .lean(),

      // Tasks for this client
      Task.find({ client: clientId, ...tf })
        .populate('assignedTo', 'name')
        .populate('createdBy', 'name')
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(50)
        .lean(),

      // Meetings for this client
      Meeting.find({ client: clientId, ...tf })
        .populate('createdBy', 'name')
        .sort({ date: -1 })
        .limit(20)
        .lean(),

      // Recent activity (last 10 items) — use Task + Meeting as proxies
      Promise.resolve([]),
    ])

    // Calculate project progress
    const totalSOPs = sopAssignments.length
    const completedSOPs = sopAssignments.filter(s => s.status === 'completed').length
    const sopProgress = totalSOPs > 0 ? Math.round((completedSOPs / totalSOPs) * 100) : 0

    const totalTasks = tasks.length
    const completedTasks = tasks.filter(t => t.status === 'completed').length
    const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    const overallProgress = totalSOPs + totalTasks > 0
      ? Math.round(((completedSOPs + completedTasks) / (totalSOPs + totalTasks)) * 100)
      : 0

    // Team members — unique set of users across tasks + sop assignments
    const teamMap = new Map()
    tasks.forEach(t => {
      if (Array.isArray(t.assignedTo)) {
        t.assignedTo.forEach(u => u && u._id && teamMap.set(String(u._id), u))
      }
    })
    sopAssignments.forEach(s => {
      if (s.assignedTo && s.assignedTo._id) teamMap.set(String(s.assignedTo._id), s.assignedTo)
    })
    const teamMembers = Array.from(teamMap.values())

    // Upcoming items (next 7 days)
    const next7 = new Date(now.getTime() + 7 * 86400000)
    const upcomingTasks = tasks.filter(t =>
      t.dueDate && new Date(t.dueDate) >= todayStart && new Date(t.dueDate) <= next7 &&
      !['completed', 'cancelled'].includes(t.status)
    )
    const upcomingMeetings = meetings.filter(m =>
      m.date && new Date(m.date) >= now && new Date(m.date) <= next7
    )

    res.json({
      success: true,
      data: {
        client,
        sopAssignments,
        tasks,
        meetings,
        teamMembers,
        progress: { sop: sopProgress, task: taskProgress, overall: overallProgress },
        counts: {
          sops: totalSOPs, completedSOPs,
          tasks: totalTasks, completedTasks,
          overdueTasks: tasks.filter(t => t.dueDate && new Date(t.dueDate) < todayStart && !['completed','cancelled'].includes(t.status)).length,
          meetings: meetings.length,
          upcomingTasks: upcomingTasks.length,
          upcomingMeetings: upcomingMeetings.length,
        },
      },
    })
  } catch (e) { next(e) }
}

// ─── ASSIGN SOP TEMPLATE TO CUSTOMER ─────────────────────────────────────────
exports.assignSOPToCustomer = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { clientId } = req.params
    const { sopId, assignedTo, dueDate, priority = 'medium' } = req.body

    if (!sopId || !assignedTo) {
      return res.status(400).json({ success: false, message: 'sopId and assignedTo are required' })
    }

    const [client, sop] = await Promise.all([
      Client.findOne({ _id: clientId, ...tf }).lean(),
      SOP.findOne({ _id: sopId, ...tf }).lean(),
    ])

    if (!client) return res.status(404).json({ success: false, message: 'Client not found' })
    if (!sop) return res.status(404).json({ success: false, message: 'SOP not found' })

    // Build checklist from SOP days + items
    const checklist = []
    if (sop.days && sop.days.length > 0) {
      sop.days.forEach(day => {
        if (day.items && day.items.length > 0) {
          day.items.forEach((item, idx) => {
            checklist.push({
              sopItemId: item._id,
              dayNumber: day.dayNumber,
              dayTitle: day.title || `Day ${day.dayNumber}`,
              title: item.title,
              order: idx,
              isCompleted: false,
              itemStatus: 'not_started',
            })
          })
        }
      })
    }

    const assignment = await SOPAssignment.create({
      sop: sop._id,
      sopTitle: sop.title,
      assignedTo,
      assignedBy: req.user.id,
      client: clientId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      priority,
      status: 'not_started',
      checklist,
      progress: 0,
      tenantId: injectTenantId(req),
    })

    logAction({
      req, action: 'assign_sop_to_customer',
      resourceType: 'SOPAssignment', resourceId: assignment._id,
      details: `Assigned "${sop.title}" to client "${client.companyName}"`,
      performedBy: req.user.id,
    }).catch(() => {})

    const populated = await SOPAssignment.findById(assignment._id)
      .populate('sop', 'title department category')
      .populate('assignedTo', 'name')
      .lean()

    res.status(201).json({ success: true, data: populated })
  } catch (e) { next(e) }
}

// ─── UPDATE CHECKLIST ITEM ────────────────────────────────────────────────────
exports.updateChecklistItem = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const { assignmentId, itemId } = req.params
    const { isCompleted, itemStatus } = req.body

    const assignment = await SOPAssignment.findOne({ _id: assignmentId, ...tf })
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })

    const item = assignment.checklist.id(itemId)
    if (!item) return res.status(404).json({ success: false, message: 'Checklist item not found' })

    if (itemStatus) {
      item.itemStatus = itemStatus
      const nowDone = itemStatus === 'completed'
      item.isCompleted = nowDone
      item.completedBy = nowDone ? req.user.id : undefined
      item.completedAt = nowDone ? new Date() : undefined
    } else if (typeof isCompleted === 'boolean') {
      item.isCompleted = isCompleted
      item.itemStatus = isCompleted ? 'completed' : 'not_started'
      item.completedBy = isCompleted ? req.user.id : undefined
      item.completedAt = isCompleted ? new Date() : undefined
    }

    await assignment.save()  // triggers progress recalculation

    res.json({ success: true, data: assignment })
  } catch (e) { next(e) }
}

// ─── TASK STATS FOR OPS ───────────────────────────────────────────────────────
exports.getTaskStats = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const now = new Date()
    const todayStart = startOfDay(now)

    const [byStatus, byPriority, overdue, upcomingThisWeek] = await Promise.all([
      Task.aggregate([{ $match: { ...tf } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Task.aggregate([{ $match: { ...tf } }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Task.countDocuments({ ...tf, status: { $nin: ['completed', 'cancelled'] }, dueDate: { $lt: todayStart } }),
      Task.countDocuments({ ...tf, status: { $nin: ['completed', 'cancelled'] }, dueDate: { $gte: todayStart, $lte: new Date(now.getTime() + 7 * 86400000) } }),
    ])
    res.json({ success: true, data: { byStatus, byPriority, overdue, upcomingThisWeek } })
  } catch (e) { next(e) }
}
