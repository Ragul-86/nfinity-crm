const mongoose = require('mongoose')

let invoiceCounter = 0

const billingSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  invoiceNumber: { type: String, unique: true },
  amount: { type: Number, required: true },
  description: { type: String, default: '' },
  dueDate: { type: Date, required: true },
  paidDate: Date,
  status: { type: String, enum: ['paid', 'pending', 'overdue'], default: 'pending', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

billingSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const count = await this.constructor.countDocuments()
    const year = new Date().getFullYear()
    this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(4, '0')}`
  }
  // Auto-mark overdue
  if (this.status === 'pending' && this.dueDate < new Date()) this.status = 'overdue'
  next()
})

module.exports = mongoose.model('Billing', billingSchema)
