const mongoose = require('mongoose')

const invoiceItemSchema = new mongoose.Schema({
  description:  { type: String, required: true },
  hsnCode:      { type: String, default: '' },     // HSN/SAC code for GST
  quantity:     { type: Number, default: 1 },
  unitPrice:    { type: Number, required: true },
  discount:     { type: Number, default: 0 },      // per-item discount %
  taxPercent:   { type: Number, default: 0 },
  amount:       { type: Number, required: true },  // quantity × unitPrice after discount
}, { _id: true })

const installmentSchema = new mongoose.Schema({
  installmentNumber: { type: Number },
  amount:     { type: Number, required: true },
  dueDate:    { type: Date },
  paidAmount: { type: Number, default: 0 },
  status:     { type: String, enum: ['pending', 'paid', 'overdue', 'partial'], default: 'pending' },
  paidDate:   { type: Date },
  paymentMethod: { type: String, default: '' },
  reference:  { type: String, default: '' },
}, { _id: true })

const paymentTimelineSchema = new mongoose.Schema({
  type:    { type: String }, // invoice_created, sent, viewed, payment_received, reminder_sent, etc.
  date:    { type: Date, default: Date.now },
  note:    { type: String, default: '' },
  amount:  { type: Number },
  by:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false })

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true, sparse: true, index: true },
  client:        { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  tenantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },

  // Line items
  items:         [invoiceItemSchema],

  // Financials
  subtotal:      { type: Number, default: 0 },
  discountAmount:{ type: Number, default: 0 },   // total invoice-level discount
  discountPercent:{ type: Number, default: 0 },
  taxAmount:     { type: Number, default: 0 },   // all tax combined
  cgst:          { type: Number, default: 0 },
  sgst:          { type: Number, default: 0 },
  igst:          { type: Number, default: 0 },
  total:         { type: Number, default: 0 },
  paidAmount:    { type: Number, default: 0 },
  outstanding:   { type: Number, default: 0 },

  // GST
  gstType:         { type: String, enum: ['non_gst', 'intra_state', 'inter_state'], default: 'non_gst' },
  gstNumber:       { type: String, default: '' },   // seller GST
  clientGstNumber: { type: String, default: '' },   // buyer GST

  // Status
  status: {
    type: String,
    enum: ['draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled'],
    default: 'draft',
    index: true,
  },

  // Payment
  paymentTerms:  { type: String, enum: ['immediate', 'net_7', 'net_15', 'net_30', 'net_45', 'net_60', 'custom'], default: 'net_30' },
  paymentMethod: { type: String, enum: ['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'razorpay', 'stripe', 'paypal', 'other'], default: 'other' },
  dueDate:       Date,
  paidDate:      Date,

  // Installments
  installmentsEnabled: { type: Boolean, default: false },
  installments:        [installmentSchema],

  // Meta
  notes:               { type: String, default: '' },
  termsAndConditions:  { type: String, default: '' },
  receipt:             { type: String, default: '' },
  linkedQuotationId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  cancelReason:        { type: String, default: '' },
  viewCount:           { type: Number, default: 0 },

  // Timestamps for workflow
  sentAt:      Date,
  viewedAt:    Date,
  cancelledAt: Date,

  // Activity timeline
  paymentTimeline: [paymentTimelineSchema],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

invoiceSchema.index({ client: 1, createdAt: -1 })
invoiceSchema.index({ tenantId: 1, status: 1 })
invoiceSchema.index({ tenantId: 1, dueDate: 1 })
invoiceSchema.index({ tenantId: 1, createdAt: -1 })

// Auto-generate invoice number + recalc outstanding
invoiceSchema.pre('save', async function (next) {
  if (this.isNew && !this.invoiceNumber) {
    try {
      const count = await mongoose.model('Invoice').countDocuments({ tenantId: this.tenantId })
      this.invoiceNumber = `INV-${String(count + 1).padStart(5, '0')}`
    } catch {
      this.invoiceNumber = `INV-${Date.now()}`
    }
  }
  // Recalc outstanding
  this.outstanding = Math.max(0, this.total - (this.paidAmount || 0))
  next()
})

module.exports = mongoose.model('Invoice', invoiceSchema)
