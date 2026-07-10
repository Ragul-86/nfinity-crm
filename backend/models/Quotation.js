const mongoose = require('mongoose')

const quotationItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  hsnCode:     { type: String, default: '' },
  quantity:    { type: Number, default: 1 },
  unitPrice:   { type: Number, required: true },
  discount:    { type: Number, default: 0 },
  taxPercent:  { type: Number, default: 0 },
  amount:      { type: Number, required: true },
}, { _id: true })

const quotationSchema = new mongoose.Schema({
  quoteNumber: { type: String, unique: true, sparse: true, index: true },
  client:      { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },

  items:     [quotationItemSchema],
  subtotal:  { type: Number, default: 0 },
  discountAmount:  { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  cgst:      { type: Number, default: 0 },
  sgst:      { type: Number, default: 0 },
  igst:      { type: Number, default: 0 },
  total:     { type: Number, default: 0 },

  // GST
  gstType:         { type: String, enum: ['non_gst', 'intra_state', 'inter_state'], default: 'non_gst' },
  gstNumber:       { type: String, default: '' },
  clientGstNumber: { type: String, default: '' },

  status: {
    type: String,
    enum: ['draft', 'sent', 'viewed', 'approved', 'rejected', 'expired', 'converted', 'cancelled'],
    default: 'draft',
    index: true,
  },

  // Existing fields (unchanged)
  validUntil:         Date,   // expiry date
  convertedInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  notes:              { type: String, default: '' },

  // New fields (non-breaking additions)
  expectedRevenue:    { type: Number, default: 0 },
  remarks:            { type: String, default: '' },
  termsAndConditions: { type: String, default: '' },
  viewCount:          { type: Number, default: 0 },

  sentAt:     Date,
  viewedAt:   Date,
  archivedAt: Date,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

quotationSchema.index({ client: 1, createdAt: -1 })
quotationSchema.index({ tenantId: 1, status: 1 })
quotationSchema.index({ tenantId: 1, createdAt: -1 })

quotationSchema.pre('save', async function (next) {
  if (this.isNew && !this.quoteNumber) {
    try {
      const count = await mongoose.model('Quotation').countDocuments({ tenantId: this.tenantId })
      this.quoteNumber = `QT-${String(count + 1).padStart(5, '0')}`
    } catch {
      this.quoteNumber = `QT-${Date.now()}`
    }
  }
  next()
})

module.exports = mongoose.model('Quotation', quotationSchema)
