const mongoose = require('mongoose')

const communicationLogSchema = new mongoose.Schema({
  type: { type: String, enum: ['call', 'email', 'meeting', 'note'], default: 'note' },
  subject: String,
  content: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now },
})

const clientSchema = new mongoose.Schema({
  companyName: { type: String, required: true, trim: true },
  brandName: { type: String, default: '' },
  industry: { type: String, default: '' },
  contactPerson: { type: String, required: true },
  phone: { type: String, default: '' },
  email: { type: String, required: true },
  website: { type: String, default: '' },
  address: { street: String, city: String, state: String, country: String, zip: String },
  status: { type: String, enum: ['active', 'inactive', 'prospect'], default: 'active', index: true },
  monthlyRetainer: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  avatar: { type: String, default: '' },
  tags: [String],

  contracts: [{
    title: String, startDate: Date, endDate: Date, value: Number,
    status: { type: String, enum: ['draft', 'active', 'expired', 'terminated'], default: 'draft' },
    fileUrl: String,
  }],
  documents: [{
    name: String, fileUrl: String, fileType: String, size: Number,
    category: { type: String, enum: ['contract', 'invoice', 'brand_asset', 'proposal', 'other'], default: 'other' },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
  communicationLogs: [communicationLogSchema],
  assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },

  // ── Workspace fields (Phase 7 additions — non-breaking) ─────────────────────
  gstNumber:       { type: String, default: '' },
  panNumber:       { type: String, default: '' },
  businessType:    { type: String, default: '' },
  package:         { type: String, default: '' },
  plan:            { type: String, default: '' },
  startDate:       Date,
  renewalDate:     Date,
  totalRevenue:    { type: Number, default: 0 },
  outstandingAmount: { type: Number, default: 0 },
  healthStatus:    { type: String, enum: ['healthy', 'attention', 'critical'], default: 'healthy' },
  lastActivityAt:  Date,
  leadId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },  // original lead
}, { timestamps: true })

module.exports = mongoose.model('Client', clientSchema)
