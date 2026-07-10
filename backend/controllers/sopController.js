const SOP = require('../models/SOP')
const SOPAssignment = require('../models/SOPAssignment')
const Task = require('../models/Task')
const Notification = require('../models/Notification')
const AuditLog = require('../models/AuditLog')
const User = require('../models/User')
const { seedSOPTemplates } = require('../utils/sopTemplatesData')
const { getTenantFilter, injectTenantId } = require('../middleware/auth')

async function logActivity({ user, action, sopId, assignmentId, details }) {
  try {
    await AuditLog.create({
      user,
      action,
      module: 'SOP',
      resourceId: sopId,
      resourceType: 'SOP',
      details: { ...(details || {}), ...(assignmentId ? { assignmentId } : {}) },
    })
  } catch (err) {
    console.error('Activity log failed:', err.message)
  }
}

// ─── SOP CRUD ─────────────────────────────────────────────────────────────────
exports.getSOPs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, status, department, isTemplate, sopType } = req.query
    const tf = getTenantFilter(req)
    const filter = { ...tf }
    if (status) filter.status = status
    if (department) filter.department = department
    if (isTemplate !== undefined) filter.isTemplate = isTemplate === 'true'
    if (sopType) filter.sopType = sopType
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ]
    const [data, total] = await Promise.all([
      SOP.find(filter).populate('owner', 'name avatar').populate('createdBy', 'name')
        .sort({ updatedAt: -1 }).skip((page-1)*Number(limit)).limit(Number(limit)),
      SOP.countDocuments(filter),
    ])
    res.json({ success: true, data, total })
  } catch (e) { next(e) }
}

exports.getSOPById = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const sop = await SOP.findOneAndUpdate(
      { _id: req.params.id, ...tf },
      { $inc: { viewCount: 1 } },
      { new: true }
    )
      .populate('owner', 'name avatar')
      .populate('versionHistory.updatedBy', 'name')
      .populate('createdBy', 'name')
    if (!sop) return res.status(404).json({ success: false, message: 'SOP not found' })
    res.json({ success: true, data: sop })
  } catch (e) { next(e) }
}

exports.createSOP = async (req, res, next) => {
  try {
    const sop = await SOP.create({ ...req.body, createdBy: req.user._id, version: 1, tenantId: injectTenantId(req) })
    await logActivity({ user: req.user._id, action: 'SOP Created', sopId: sop._id, details: { title: sop.title } })
    res.status(201).json({ success: true, data: sop })
  } catch (e) { next(e) }
}

exports.updateSOP = async (req, res, next) => {
  try {
  const tf = getTenantFilter(req)
  const sop = await SOP.findOne({ _id: req.params.id, ...tf })
  if (!sop) return res.status(404).json({ success: false, message: 'SOP not found' })

  const prevVersion = sop.version
  sop.versionHistory.push({
    version: prevVersion,
    updatedBy: req.user._id,
    updatedAt: new Date(),
    changes: req.body.changeNote || `Version ${prevVersion} saved`,
  })

  const snapshot = sop.toObject()
  sop.versionHistory[sop.versionHistory.length - 1].snapshot = snapshot
  sop.version = prevVersion + 1

  Object.keys(req.body).forEach(key => {
    if (key !== 'changeNote') sop[key] = req.body[key]
  })

  await sop.save()
  await sop.populate('owner', 'name avatar')
  await logActivity({
    user: req.user._id,
    action: 'SOP Edited',
    sopId: sop._id,
    details: { changeNote: req.body.changeNote || '', newVersion: sop.version },
  })
  res.json({ success: true, data: sop })
  } catch (e) { next(e) }
}

exports.duplicateSOP = async (req, res, next) => {
  try {
  const tf = getTenantFilter(req)
  const original = await SOP.findOne({ _id: req.params.id, ...tf })
  if (!original) return res.status(404).json({ success: false, message: 'SOP not found' })

  const copy = original.toObject()
  delete copy._id; delete copy.sopId; delete copy.createdAt; delete copy.updatedAt
  copy.title = `${copy.title} (Copy)`
  copy.status = 'draft'
  copy.version = 1
  copy.versionHistory = []
  copy.viewCount = 0
  copy.bookmarkedBy = []
  copy.createdBy = req.user._id
  copy.tenantId = injectTenantId(req)

  const newSOP = await SOP.create(copy)
  await logActivity({
    user: req.user._id,
    action: 'SOP Duplicated',
    sopId: newSOP._id,
    details: { sourceSopId: original._id, title: newSOP.title },
  })
  res.status(201).json({ success: true, data: newSOP })
  } catch (e) { next(e) }
}

exports.archiveSOP = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const sop = await SOP.findOneAndUpdate(
      { _id: req.params.id, ...tf },
      { status: 'archived', archivedAt: new Date() },
      { new: true }
    )
    if (!sop) return res.status(404).json({ success: false, message: 'SOP not found' })
    await logActivity({ user: req.user._id, action: 'SOP Archived', sopId: sop._id, details: { title: sop.title } })
    res.json({ success: true, data: sop })
  } catch (e) { next(e) }
}

exports.restoreSOP = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const sop = await SOP.findOne({ _id: req.params.id, ...tf })
    if (!sop) return res.status(404).json({ success: false, message: 'SOP not found' })
    if (sop.status !== 'archived') return res.status(400).json({ success: false, message: 'SOP is not archived' })
    sop.status = 'active'
    sop.archivedAt = undefined
    await sop.save()
    await logActivity({ user: req.user._id, action: 'SOP Restored', sopId: sop._id, details: { title: sop.title } })
    res.json({ success: true, data: sop })
  } catch (e) { next(e) }
}

exports.deleteSOP = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    await SOP.findOneAndDelete({ _id: req.params.id, ...tf })
    res.json({ success: true, message: 'SOP deleted' })
  } catch (e) { next(e) }
}

exports.getActivityLog = async (req, res, next) => {
  try {
    const logs = await AuditLog.find({ resourceType: 'SOP', resourceId: req.params.id })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(200)
    res.json({ success: true, data: logs })
  } catch (e) { next(e) }
}

exports.getVersionHistory = async (req, res, next) => {
  try {
    const tf = getTenantFilter(req)
    const sop = await SOP.findOne({ _id: req.params.id, ...tf })
      .select('title version versionHistory')
      .populate('versionHistory.updatedBy', 'name avatar')
    if (!sop) return res.status(404).json({ success: false, message: 'SOP not found' })
    const history = [...sop.versionHistory].sort((a, b) => b.version - a.version)
    res.json({ success: true, data: { currentVersion: sop.version, history } })
  } catch (e) { next(e) }
}

exports.compareVersions = async (req, res) => {
  const tf = getTenantFilter(req)
  const sop = await SOP.findOne({ _id: req.params.id, ...tf }).populate('versionHistory.updatedBy', 'name')
  if (!sop) return res.status(404).json({ success: false, message: 'SOP not found' })

  const resolveSide = (v) => {
    if (v === 'current' || Number(v) === sop.version) {
      return { version: sop.version, updatedAt: sop.updatedAt, snapshot: sop.toObject() }
    }
    const entry = sop.versionHistory.find(h => h.version === Number(v))
    if (!entry) return null
    return { version: entry.version, updatedBy: entry.updatedBy, updatedAt: entry.updatedAt, changes: entry.changes, snapshot: entry.snapshot }
  }

  const v1 = resolveSide(req.query.v1)
  const v2 = resolveSide(req.query.v2)
  if (!v1 || !v2) return res.status(404).json({ success: false, message: 'One or both versions not found' })

  res.json({ success: true, data: { v1, v2 } })
}

exports.restoreVersion = async (req, res) => {
  const tf = getTenantFilter(req)
  const sop = await SOP.findOne({ _id: req.params.id, ...tf })
  if (!sop) return res.status(404).json({ success: false, message: 'SOP not found' })

  const entry = sop.versionHistory.find(h => h.version === Number(req.params.version))
  if (!entry || !entry.snapshot) {
    return res.status(404).json({ success: false, message: 'That version has no snapshot to restore from' })
  }

  const prevVersion = sop.version
  sop.versionHistory.push({
    version: prevVersion,
    updatedBy: req.user._id,
    updatedAt: new Date(),
    changes: `Restored to v${req.params.version}`,
    snapshot: sop.toObject(),
  })

  const RESTORABLE_FIELDS = ['title', 'department', 'description', 'estimatedDuration', 'days', 'tags', 'templateCategory']
  RESTORABLE_FIELDS.forEach(field => {
    if (entry.snapshot[field] !== undefined) sop[field] = entry.snapshot[field]
  })
  sop.version = prevVersion + 1

  await sop.save()
  await logActivity({
    user: req.user._id,
    action: 'SOP Edited',
    sopId: sop._id,
    details: { restoredFromVersion: Number(req.params.version), newVersion: sop.version },
  })
  res.json({ success: true, data: sop })
}

exports.toggleBookmark = async (req, res) => {
  const tf = getTenantFilter(req)
  const sop = await SOP.findOne({ _id: req.params.id, ...tf })
  if (!sop) return res.status(404).json({ success: false, message: 'SOP not found' })
  const userId = req.user._id.toString()
  const isBookmarked = sop.bookmarkedBy.some(id => id.toString() === userId)
  if (isBookmarked) sop.bookmarkedBy.pull(req.user._id)
  else sop.bookmarkedBy.push(req.user._id)
  await sop.save()
  res.json({ success: true, isBookmarked: !isBookmarked })
}

// ─── SOP ASSIGNMENT ───────────────────────────────────────────────────────────
exports.assignSOP = async (req, res) => {
  const tf = getTenantFilter(req)
  const tenantId = injectTenantId(req)
  const sop = await SOP.findOne({ _id: req.params.id, ...tf })
  if (!sop) return res.status(404).json({ success: false, message: 'SOP not found' })

  const checklist = []
  sop.days.forEach(day => {
    day.items.forEach(item => {
      checklist.push({
        sopItemId: item._id,
        dayNumber: day.dayNumber,
        dayTitle: day.title || `Day ${day.dayNumber}`,
        title: item.title,
        isCompleted: false,
      })
    })
  })

  const assignment = await SOPAssignment.create({
    sop: sop._id,
    sopTitle: sop.title,
    assignedTo: req.body.assignedTo,
    assignedBy: req.user._id,
    client: req.body.client,
    dueDate: req.body.dueDate,
    priority: req.body.priority || 'medium',
    checklist,
    tenantId,
  })

  if (req.body.autoCreateTasks !== false && checklist.length > 0) {
    const tasks = await Task.insertMany(checklist.map(item => ({
      title: `[${sop.sopId}] ${item.title}`,
      description: `Day ${item.dayNumber}: ${item.dayTitle} — from SOP: ${sop.title}`,
      assignedTo: [req.body.assignedTo],
      status: 'pending',
      priority: req.body.priority || 'medium',
      dueDate: req.body.dueDate,
      createdBy: req.user._id,
      sop: sop._id,
      sopAssignment: assignment._id,
      tenantId,
    })))
    assignment.autoCreatedTasks = tasks.map(t => t._id)
    await assignment.save()

    await Notification.create({
      recipient: req.body.assignedTo,
      type: 'task',
      title: 'SOP Tasks Created',
      message: `${tasks.length} task${tasks.length === 1 ? '' : 's'} created from "${sop.title}"`,
      link: '/tasks',
    })
  }

  await Notification.create({
    recipient: req.body.assignedTo,
    type: 'sop_approval',
    title: 'SOP Assigned',
    message: `${sop.title} has been assigned to you${req.body.dueDate ? ` — due ${new Date(req.body.dueDate).toLocaleDateString()}` : ''}`,
    link: '/sop',
  })

  await logActivity({
    user: req.user._id,
    action: 'SOP Assigned',
    sopId: sop._id,
    assignmentId: assignment._id,
    details: { assignedTo: req.body.assignedTo, dueDate: req.body.dueDate },
  })

  await assignment.populate([
    { path: 'assignedTo', select: 'name avatar' },
    { path: 'client', select: 'companyName' },
    { path: 'sop', select: 'title sopId' },
  ])
  res.status(201).json({ success: true, data: assignment })
}

exports.reassignAssignment = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })
  const previousAssignee = assignment.assignedTo

  assignment.assignedTo = req.body.assignedTo
  assignment.activityLog.push({
    action: 'SOP Reassigned',
    performedBy: req.user._id,
    timestamp: new Date(),
    metadata: { from: previousAssignee, to: req.body.assignedTo },
  })
  await assignment.save()

  if (assignment.autoCreatedTasks?.length) {
    await Task.updateMany(
      { _id: { $in: assignment.autoCreatedTasks }, ...tf },
      { $set: { assignedTo: [req.body.assignedTo] } },
    )
  }

  await Notification.create({
    recipient: req.body.assignedTo,
    type: 'sop_approval',
    title: 'SOP Reassigned To You',
    message: `${assignment.sopTitle} has been reassigned to you`,
    link: '/sop',
  })

  await logActivity({
    user: req.user._id,
    action: 'SOP Reassigned',
    sopId: assignment.sop,
    assignmentId: assignment._id,
    details: { from: previousAssignee, to: req.body.assignedTo },
  })

  await assignment.populate([
    { path: 'assignedTo', select: 'name avatar' },
    { path: 'assignedBy', select: 'name' },
  ])
  res.json({ success: true, data: assignment })
}

exports.getAssignments = async (req, res) => {
  const { assignedTo, client, status, page = 1, limit = 20 } = req.query
  const tf = getTenantFilter(req)
  const filter = { ...tf }
  if (assignedTo) filter.assignedTo = assignedTo
  if (client) filter.client = client
  if (status) filter.status = status

  if (req.user.role === 'employee') filter.assignedTo = req.user._id

  const [data, total] = await Promise.all([
    SOPAssignment.find(filter)
      .populate('sop', 'title sopId department')
      .populate('assignedTo', 'name avatar')
      .populate('assignedBy', 'name')
      .populate('client', 'companyName')
      .sort({ createdAt: -1 })
      .skip((page-1)*Number(limit)).limit(Number(limit)),
    SOPAssignment.countDocuments(filter),
  ])
  res.json({ success: true, data, total })
}

exports.getAssignmentById = async (req, res) => {
  const tf = getTenantFilter(req)
  const a = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
    .populate('sop', 'title sopId department days')
    .populate('assignedTo', 'name avatar email')
    .populate('assignedBy', 'name')
    .populate('client', 'companyName')
    .populate('checklist.completedBy', 'name')
    .populate('comments.author', 'name avatar')
    .populate('activityLog.performedBy', 'name')
  if (!a) return res.status(404).json({ success: false, message: 'Assignment not found' })
  res.json({ success: true, data: a })
}

exports.completeItem = async (req, res) => {
  const itemId = req.body.checklistItemId || req.body.itemId
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })

  const item = assignment.checklist.id(itemId)
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' })

  const statusBeforeSave = assignment.status
  item.isCompleted = !item.isCompleted
  if (item.isCompleted) {
    item.completedBy = req.user._id
    item.completedAt = new Date()
    assignment.activityLog.push({
      action: `✓ ${item.title} — Completed`,
      performedBy: req.user._id,
      timestamp: new Date(),
    })
  } else {
    item.completedBy = undefined
    item.completedAt = undefined
  }

  await assignment.save()

  if (item.isCompleted) {
    await logActivity({
      user: req.user._id,
      action: 'Checklist Completed',
      sopId: assignment.sop,
      assignmentId: assignment._id,
      details: { item: item.title },
    })
  }

  if (statusBeforeSave !== 'awaiting_review' && assignment.status === 'awaiting_review' && assignment.assignedBy) {
    await Notification.create({
      recipient: assignment.assignedBy,
      type: 'sop_approval',
      title: 'SOP Awaiting Review',
      message: `${assignment.sopTitle} is fully checked off and ready for your review`,
      link: '/sop',
    })
  }

  await assignment.populate('checklist.completedBy', 'name')
  await assignment.populate('activityLog.performedBy', 'name')
  res.json({ success: true, data: { progress: assignment.progress, status: assignment.status, checklist: assignment.checklist, activityLog: assignment.activityLog } })
}

// ─── CHECKLIST MANAGEMENT ─────────────────────────────────────────────────────
exports.addChecklistItem = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })
  if (!req.body.title) return res.status(400).json({ success: false, message: 'title is required' })

  const maxOrder = assignment.checklist.reduce((max, i) => Math.max(max, i.order || 0), 0)
  assignment.checklist.push({
    title: req.body.title,
    dayNumber: req.body.dayNumber || null,
    dayTitle: req.body.dayTitle || 'Custom',
    isCompleted: false,
    order: maxOrder + 1,
    isCustom: true,
  })
  assignment.activityLog.push({
    action: `+ Custom item added: ${req.body.title}`,
    performedBy: req.user._id,
    timestamp: new Date(),
  })
  await assignment.save()
  res.status(201).json({ success: true, data: assignment.checklist })
}

exports.deleteChecklistItem = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })

  const item = assignment.checklist.id(req.params.itemId)
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' })
  if (!item.isCustom) return res.status(400).json({ success: false, message: 'Only custom checklist items can be deleted' })

  assignment.activityLog.push({
    action: `- Custom item removed: ${item.title}`,
    performedBy: req.user._id,
    timestamp: new Date(),
  })
  assignment.checklist.pull(req.params.itemId)
  await assignment.save()
  res.json({ success: true, data: assignment.checklist })
}

exports.reorderChecklist = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })
  const order = req.body.order || []

  order.forEach((itemId, index) => {
    const item = assignment.checklist.id(itemId)
    if (item) item.order = index + 1
  })
  assignment.checklist.sort((a, b) => (a.order || 0) - (b.order || 0))
  await assignment.save()
  res.json({ success: true, data: assignment.checklist })
}

exports.addChecklistItemComment = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })
  const item = assignment.checklist.id(req.params.itemId)
  if (!item) return res.status(404).json({ success: false, message: 'Item not found' })
  if (!req.body.text) return res.status(400).json({ success: false, message: 'text is required' })

  item.comments.push({ text: req.body.text, author: req.user._id })
  await assignment.save()
  await assignment.populate('checklist.comments.author', 'name avatar')
  const saved = assignment.checklist.id(req.params.itemId)
  res.status(201).json({ success: true, data: saved.comments })
}

// ─── COMMENTS & COLLABORATION ─────────────────────────────────────────────────
exports.addComment = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })
  if (!req.body.text) return res.status(400).json({ success: false, message: 'text is required' })

  const mentions = Array.isArray(req.body.mentions) ? req.body.mentions : []
  const parentComment = req.body.parentComment || null

  assignment.comments.push({ text: req.body.text, author: req.user._id, mentions, parentComment })
  await assignment.save()
  const newComment = assignment.comments[assignment.comments.length - 1]

  const notifiedIds = new Set()
  for (const userId of mentions) {
    if (userId.toString() === req.user._id.toString()) continue
    notifiedIds.add(userId.toString())
    await Notification.create({
      recipient: userId,
      type: 'mention',
      title: 'You were mentioned',
      message: `${req.user.name} mentioned you in a comment on "${assignment.sopTitle}"`,
      link: '/sop',
    })
  }

  if (parentComment) {
    const parent = assignment.comments.id(parentComment)
    if (parent && parent.author && parent.author.toString() !== req.user._id.toString() && !notifiedIds.has(parent.author.toString())) {
      await Notification.create({
        recipient: parent.author,
        type: 'mention',
        title: 'New Reply',
        message: `${req.user.name} replied to your comment on "${assignment.sopTitle}"`,
        link: '/sop',
      })
    }
  }

  await logActivity({
    user: req.user._id,
    action: 'Comment Added',
    sopId: assignment.sop,
    assignmentId: assignment._id,
    details: { commentId: newComment._id, isReply: !!parentComment },
  })

  await assignment.populate('comments.author', 'name avatar')
  res.status(201).json({ success: true, data: assignment.comments })
}

exports.editComment = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })
  const comment = assignment.comments.id(req.params.commentId)
  if (!comment || comment.isDeleted) return res.status(404).json({ success: false, message: 'Comment not found' })
  if (comment.author.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'You can only edit your own comments' })
  }
  comment.text = req.body.text
  comment.isEdited = true
  await assignment.save()
  await assignment.populate('comments.author', 'name avatar')
  res.json({ success: true, data: assignment.comments })
}

exports.deleteComment = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })
  const comment = assignment.comments.id(req.params.commentId)
  if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' })

  const isOwn = comment.author.toString() === req.user._id.toString()
  const canModerate = ['super_admin', 'admin', 'manager'].includes(req.user.role)
  if (!isOwn && !canModerate) {
    return res.status(403).json({ success: false, message: 'You can only delete your own comments' })
  }

  comment.isDeleted = true
  comment.text = '[deleted]'
  await assignment.save()
  res.json({ success: true, data: assignment.comments })
}

exports.resolveComment = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })
  const comment = assignment.comments.id(req.params.commentId)
  if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' })
  comment.resolved = !comment.resolved
  await assignment.save()
  res.json({ success: true, data: assignment.comments })
}

// ─── REVIEW WORKFLOW ──────────────────────────────────────────────────────────
exports.submitForReview = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })
  if (['completed', 'archived'].includes(assignment.status)) {
    return res.status(400).json({ success: false, message: `Cannot submit a ${assignment.status} SOP for review` })
  }

  assignment.status = 'awaiting_review'
  assignment.reviewRequestedAt = new Date()
  assignment.activityLog.push({ action: 'Submitted for review', performedBy: req.user._id, timestamp: new Date() })
  await assignment.save()

  if (assignment.assignedBy) {
    await Notification.create({
      recipient: assignment.assignedBy,
      type: 'sop_approval',
      title: 'SOP Review Requested',
      message: `${assignment.sopTitle} has been submitted for your review`,
      link: '/sop',
    })
  }

  res.json({ success: true, data: assignment })
}

exports.approveAssignment = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })

  assignment.status = 'completed'
  assignment.completedAt = new Date()
  assignment.reviewedBy = req.user._id
  assignment.reviewNotes = req.body.notes || ''
  assignment.activityLog.push({
    action: 'Approved — SOP Completed',
    performedBy: req.user._id,
    timestamp: new Date(),
    metadata: { notes: req.body.notes || '' },
  })
  await assignment.save()

  await Notification.create({
    recipient: assignment.assignedTo,
    type: 'sop_approval',
    title: 'SOP Completed',
    message: `${assignment.sopTitle} was approved and marked complete`,
    link: '/sop',
  })

  res.json({ success: true, data: assignment })
}

exports.requestChanges = async (req, res) => {
  const tf = getTenantFilter(req)
  const assignment = await SOPAssignment.findOne({ _id: req.params.id, ...tf })
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' })

  assignment.status = 'in_progress'
  assignment.reviewedBy = req.user._id
  assignment.reviewNotes = req.body.notes || ''
  assignment.activityLog.push({
    action: 'Changes requested',
    performedBy: req.user._id,
    timestamp: new Date(),
    metadata: { notes: req.body.notes || '' },
  })
  await assignment.save()

  await Notification.create({
    recipient: assignment.assignedTo,
    type: 'sop_approval',
    title: 'Changes Requested',
    message: `${assignment.sopTitle} needs changes before it can be approved${req.body.notes ? `: ${req.body.notes}` : ''}`,
    link: '/sop',
  })

  res.json({ success: true, data: assignment })
}

// GET /api/sop/stats — dashboard widgets
exports.getStats = async (req, res) => {
  const tf = getTenantFilter(req)
  const [
    totalSOPs,
    active,
    completed,
    overdue,
    totalAssignments,
    recentlyUpdated,
    myAssignedSOPs,
    awaitingReview,
  ] = await Promise.all([
    SOP.countDocuments({ ...tf }),
    SOPAssignment.countDocuments({ status: 'in_progress', ...tf }),
    SOPAssignment.countDocuments({ status: 'completed', ...tf }),
    SOPAssignment.countDocuments({ status: 'overdue', ...tf }),
    SOPAssignment.countDocuments({ ...tf }),
    SOP.find({ ...tf }).sort({ updatedAt: -1 }).limit(5).select('title sopId status sopType updatedAt'),
    SOPAssignment.countDocuments({ assignedTo: req.user._id, status: { $nin: ['completed', 'archived'] }, ...tf }),
    SOPAssignment.countDocuments({ status: 'awaiting_review', ...tf }),
  ])
  const completionRate = totalAssignments > 0 ? Math.round((completed / totalAssignments) * 100) : 0

  res.json({
    success: true,
    data: {
      totalSOPs, active, completed, overdue,
      total: totalAssignments, completionRate,
      recentlyUpdated, myAssignedSOPs, awaitingReview,
    },
  })
}

exports.seedTemplates = async (req, res) => {
  const tenantId = injectTenantId(req)
  const result = await seedSOPTemplates(SOP, req.user._id, tenantId)
  res.json({ success: true, ...result })
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
