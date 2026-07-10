const mongoose = require('mongoose')

const creditNoteSchema = new mongoose.Schema({
  creditNoteNumber: { type: String, unique: true, sparse: true, index: true }, // CN-00001

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

  issuedAt: Date,
  appliedAt: Date,

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

creditNoteSchema.index({ tenantId: 1, createdAt: -1 })
creditNoteSchema.index({ client: 1 })

creditNoteSchema.pre('save', async function (next) {
  if (this.isNew && !this.creditNoteNumber) {
    try {
      const count = await mongoose.model('CreditNote').countDocuments({ tenantId: this.tenantId })
      this.creditNoteNumber = `CN-${String(count + 1).padStart(5, '0')}`
    } catch {
      this.creditNoteNumber = `CN-${Date.now()}`
    }
  }
  next()
})

module.exports = mongoose.model('CreditNote', creditNoteSchema)
