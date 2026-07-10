const mongoose = require('mongoose')

const debitNoteSchema = new mongoose.Schema({
  debitNoteNumber: { type: String, unique: true, sparse: true, index: true }, // DN-00001

  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
  client:   { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  invoice:  { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },

  amount:   { type: Number, required: true },
  reason:   { type: String, required: true },
  notes:    { type: String, default: '' },

  status: {
    type: String,
    enum: ['draft', 'issued', 'applied', 'cancelled'],
    default: 'draft',
    index: true,
  },

  issuedAt:  Date,
  appliedAt: Date,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

debitNoteSchema.index({ tenantId: 1, createdAt: -1 })
debitNoteSchema.index({ client: 1 })

debitNoteSchema.pre('save', async function (next) {
  if (this.isNew && !this.debitNoteNumber) {
    try {
      const count = await mongoose.model('DebitNote').countDocuments({ tenantId: this.tenantId })
      this.debitNoteNumber = `DN-${String(count + 1).padStart(5, '0')}`
    } catch {
      this.debitNoteNumber = `DN-${Date.now()}`
    }
  }
  next()
})

module.exports = mongoose.model('DebitNote', debitNoteSchema)
