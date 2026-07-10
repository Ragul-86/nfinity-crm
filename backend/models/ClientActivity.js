const mongoose = require('mongoose')

const clientActivitySchema = new mongoose.Schema({
  client:      { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
  type: {
    type: String,
    enum: [
      'client_created', 'client_updated', 'lead_converted',
      'meeting_scheduled', 'meeting_completed', 'call_made',
      'whatsapp_sent', 'email_sent', 'sms_sent',
      'quotation_created', 'quotation_approved', 'quotation_rejected', 'quotation_converted',
      'invoice_created', 'invoice_sent', 'invoice_paid', 'invoice_overdue',
      'payment_received', 'payment_partial',
      'task_created', 'task_completed', 'task_overdue',
      'sop_assigned', 'sop_completed',
      'file_uploaded', 'file_deleted',
      'note_added', 'note_deleted',
      'renewal_upcoming', 'renewal_completed',
      'status_changed', 'other',
    ],
    required: true,
    index: true,
  },
  description: { type: String, required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  metadata:    { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true })

clientActivitySchema.index({ client: 1, createdAt: -1 })
clientActivitySchema.index({ tenantId: 1, createdAt: -1 })

module.exports = mongoose.model('ClientActivity', clientActivitySchema)
