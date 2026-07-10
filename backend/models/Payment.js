const mongoose = require('mongoose')

// Standalone payment record — one per transaction, linked to an Invoice
const paymentSchema = new mongoose.Schema({
  paymentNumber: { type: String, unique: true, sparse: true, index: true }, // PAY-00001

  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
  invoice:  { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  client:   { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },

  amount:          { type: Number, required: true },
  paymentDate:     { type: Date, default: Date.now },
  paymentMethod:   {
    type: String,
    enum: ['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'razorpay', 'stripe', 'paypal', 'other'],
    default: 'other',
  },
  referenceNumber: { type: String, default: '' },
  transactionId:   { type: String, default: '' },
  remarks:         { type: String, default: '' },
  receiptUrl:      { type: String, default: '' },

  collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

paymentSchema.index({ tenantId: 1, paymentDate: -1 })
paymentSchema.index({ invoice: 1 })
paymentSchema.index({ client: 1, paymentDate: -1 })

paymentSchema.pre('save', async function (next) {
  if (this.isNew && !this.paymentNumber) {
    try {
      const count = await mongoose.model('Payment').countDocuments({ tenantId: this.tenantId })
      this.paymentNumber = `PAY-${String(count + 1).padStart(5, '0')}`
    } catch {
      this.paymentNumber = `PAY-${Date.now()}`
    }
  }
  next()
})

module.exports = mongoose.model('Payment', paymentSchema)
