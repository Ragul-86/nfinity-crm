const mongoose = require('mongoose')

const followUpSchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },

  scheduledAt: { type: Date, required: true },   // Date + time of the follow-up
  mode: {
    type: String,
    enum: ['phone', 'whatsapp', 'email', 'meeting', 'video_call'],
    default: 'phone',
  },

  title: { type: String, default: '' },           // Short label
  notes: { type: String, default: '' },           // Pre-call notes / agenda
  outcome: { type: String, default: '' },         // Post-call result
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'overdue'],
    default: 'pending',
  },
  completedAt: Date,

  // Reminder
  reminder: { type: Boolean, default: false },
  reminderAt: Date,                               // when to send reminder
  reminderSent: { type: Boolean, default: false },

  // People
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

followUpSchema.index({ lead: 1, scheduledAt: 1 })
followUpSchema.index({ tenantId: 1, scheduledAt: 1 })
followUpSchema.index({ assignedTo: 1, scheduledAt: 1 })

module.exports = mongoose.model('FollowUp', followUpSchema)
