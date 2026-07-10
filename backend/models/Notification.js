const mongoose = require('mongoose')

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Backward-compat type field (keep old enum values + new ones)
  type: {
    type: String,
    default: 'system',
  },

  // New: category for filtering
  category: {
    type: String,
    enum: ['leads','customers','invoices','quotations','payments','tasks','meetings',
           'calendar','sop','team','integrations','system','security'],
    default: 'system',
    index: true,
  },

  // New: severity level
  severity: {
    type: String,
    enum: ['info', 'success', 'warning', 'critical', 'error'],
    default: 'info',
  },

  title:   { type: String, required: true },
  message: { type: String, required: true },

  isRead:     { type: Boolean, default: false, index: true },
  isArchived: { type: Boolean, default: false },

  // URL to navigate to when clicked
  actionUrl: { type: String },
  link:      { type: String }, // backward compat alias

  metadata: { type: mongoose.Schema.Types.Mixed },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true })

// TTL — auto-delete after 60 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 })
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 })
notificationSchema.index({ recipient: 1, category: 1, createdAt: -1 })

module.exports = mongoose.model('Notification', notificationSchema)
