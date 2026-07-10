/**
 * AIUsage.js — tracks every AI interaction for auditing, history, and limits.
 * Auto-deletes after 90 days via TTL index.
 */
const mongoose = require('mongoose')

const aiUsageSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  provider: { type: String, default: 'claude' },
  model:    { type: String, default: '' },
  module: {
    type: String,
    enum: ['lead','customer','invoice','quotation','sop','task','dashboard','reports','meeting','general'],
    default: 'general',
  },
  action: {
    type: String,
    enum: ['chat','copied','note_saved','task_created','message_sent','opened'],
    default: 'chat',
  },
  prompt:      { type: String, maxlength: 2000, default: '' },
  response:    { type: String, maxlength: 6000, default: '' },
  tokensUsed:  { type: Number, default: 0 },
  pageContext: { type: String, default: '' },
  createdAt:   { type: Date, default: Date.now },
}, { timestamps: false })

// TTL — auto-delete after 90 days
aiUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })
// Query indexes
aiUsageSchema.index({ tenantId: 1, userId: 1, createdAt: -1 })
aiUsageSchema.index({ tenantId: 1, createdAt: -1 })

module.exports = mongoose.model('AIUsage', aiUsageSchema)
