const mongoose = require('mongoose')

const noteSchema = new mongoose.Schema({
  text: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

const metaLeadSchema = new mongoose.Schema({
  // Meta identifiers (unique to prevent duplicates)
  metaLeadId: { type: String, unique: true, sparse: true },
  formId: String,
  adId: String,
  adSetId: String,
  campaignId: String,

  // Lead contact info
  fullName: { type: String, required: true },
  phone: String,
  email: String,

  // Campaign context
  campaignName: String,
  adSetName: String,
  adName: String,
  platform: { type: String, enum: ['facebook', 'instagram', 'unknown'], default: 'unknown' },

  // CRM fields
  status: {
    type: String,
    enum: ['new', 'contacted', 'follow_up', 'qualified', 'converted', 'lost'],
    default: 'new',
    index: true,
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: [noteSchema],
  followUpDate: Date,

  // Raw Meta payload (stored for debugging/re-processing)
  rawData: mongoose.Schema.Types.Mixed,
  receivedAt: { type: Date, default: Date.now, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true })

metaLeadSchema.index({ platform: 1, status: 1 })
metaLeadSchema.index({ campaignId: 1 })
metaLeadSchema.index({ assignedTo: 1 })

module.exports = mongoose.model('MetaLead', metaLeadSchema)
