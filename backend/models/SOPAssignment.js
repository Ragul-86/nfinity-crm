const mongoose = require('mongoose')

const itemCommentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

const checklistItemSchema = new mongoose.Schema({
  sopItemId: mongoose.Schema.Types.ObjectId,
  dayNumber: Number,
  dayTitle: String,
  title: String,
  isCompleted: { type: Boolean, default: false },
  itemStatus: {
    type: String,
    enum: ['not_started', 'in_progress', 'waiting', 'blocked', 'completed', 'skipped'],
    default: 'not_started',
  },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedAt: Date,
  order: { type: Number, default: 0 },
  isCustom: { type: Boolean, default: false },
  comments: [itemCommentSchema],
}, { _id: true })

const commentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  parentComment: { type: mongoose.Schema.Types.ObjectId, default: null },
  resolved: { type: Boolean, default: false },
  isEdited: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true })

const activityLogSchema = new mongoose.Schema({
  action: String,
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },
})

const sopAssignmentSchema = new mongoose.Schema({
  sop: { type: mongoose.Schema.Types.ObjectId, ref: 'SOP', required: true, index: true },
  sopTitle: String,  // snapshot
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },  // optional: ties an SOP assignment to a campaign workspace
  dueDate: Date,
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'awaiting_review', 'completed', 'overdue', 'archived'],
    default: 'not_started',
    index: true,
  },

  checklist: [checklistItemSchema],
  progress: { type: Number, default: 0 },  // 0-100

  startedAt: Date,
  completedAt: Date,
  reviewRequestedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewNotes: { type: String, default: '' },
  autoCreatedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  activityLog: [activityLogSchema],
  comments: [commentSchema],
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true })

// Calculate progress on save
sopAssignmentSchema.pre('save', function (next) {
  if (this.checklist.length > 0) {
    const done = this.checklist.filter(i => i.isCompleted).length
    this.progress = Math.round((done / this.checklist.length) * 100)
    if (this.progress === 100 && ['not_started', 'in_progress'].includes(this.status)) {
      // Checklist fully done — route to review rather than auto-completing,
      // so a manager can sign off (Awaiting Review step in the SOP lifecycle).
      this.status = 'awaiting_review'
      this.reviewRequestedAt = new Date()
    } else if (this.progress > 0 && this.progress < 100 && this.status === 'not_started') {
      this.status = 'in_progress'
      if (!this.startedAt) this.startedAt = new Date()
    } else if (this.progress < 100 && this.status === 'awaiting_review') {
      // An item got reopened after review was requested — back to in_progress.
      this.status = 'in_progress'
    }
  }
  // Check overdue (doesn't override terminal/review states)
  if (this.dueDate && this.dueDate < new Date() && !['completed', 'awaiting_review', 'archived'].includes(this.status)) {
    this.status = 'overdue'
  }
  next()
})

module.exports = mongoose.model('SOPAssignment', sopAssignmentSchema)
