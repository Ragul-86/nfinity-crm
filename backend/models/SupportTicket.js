/**
 * SupportTicket.js — client support tickets created through the portal
 */
const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
  sender:      { type: String, enum: ['client', 'support'], default: 'client' },
  senderName:  { type: String, default: '' },
  message:     { type: String, required: true },
  isInternal:  { type: Boolean, default: false }, // internal CRM notes not shown to client
  timestamp:   { type: Date, default: Date.now },
}, { _id: true })

const supportTicketSchema = new mongoose.Schema({
  tenantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  clientId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  portalUserId:  { type: mongoose.Schema.Types.ObjectId, ref: 'ClientPortalUser', required: true },

  ticketNumber: { type: String, unique: true }, // e.g. TKT-0001

  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '' },

  category: {
    type: String,
    enum: ['billing', 'technical', 'general', 'feature_request', 'urgent'],
    default: 'general',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'waiting_client', 'resolved', 'closed'],
    default: 'open',
  },

  messages: [messageSchema],

  assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt:  { type: Date },
  closedAt:    { type: Date },

}, { timestamps: true })

// Auto-generate ticket number before first save
supportTicketSchema.pre('save', async function (next) {
  if (!this.ticketNumber) {
    const count = await mongoose.model('SupportTicket').countDocuments({ tenantId: this.tenantId })
    this.ticketNumber = `TKT-${String(count + 1).padStart(4, '0')}`
  }
  next()
})

supportTicketSchema.index({ tenantId: 1, status: 1, createdAt: -1 })
supportTicketSchema.index({ clientId: 1, createdAt: -1 })

module.exports = mongoose.model('SupportTicket', supportTicketSchema)
