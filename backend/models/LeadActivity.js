const mongoose = require('mongoose')

/**
 * LeadActivity — immutable timeline events for a lead.
 * Created by controllers whenever something noteworthy happens.
 */
const leadActivitySchema = new mongoose.Schema({
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },

  type: {
    type: String,
    required: true,
    enum: [
      'lead_created',
      'lead_updated',
      'status_changed',
      'priority_changed',
      'assigned',
      'unassigned',
      'note_added',
      'note_deleted',
      'follow_up_scheduled',
      'follow_up_completed',
      'follow_up_cancelled',
      'call_made',
      'email_sent',
      'whatsapp_sent',
      'meeting_held',
      'video_call',
      'file_uploaded',
      'file_deleted',
      'tag_added',
      'tag_removed',
      'value_updated',
      'converted',
      'lost',
      'archived',
      'form_submitted',
      'imported',
      'pipeline_moved',
    ],
  },

  description: { type: String, required: true },   // human-readable summary
  oldValue: { type: String, default: '' },          // previous value (for change events)
  newValue: { type: String, default: '' },          // new value

  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  metadata: { type: mongoose.Schema.Types.Mixed },  // extra context (follow-up id, note id, etc.)
}, {
  timestamps: true,
  // Activities are write-once: no updates allowed from application layer
})

leadActivitySchema.index({ lead: 1, createdAt: -1 })
leadActivitySchema.index({ tenantId: 1, createdAt: -1 })

module.exports = mongoose.model('LeadActivity', leadActivitySchema)
