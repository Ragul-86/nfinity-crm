const mongoose = require('mongoose')

// A single checklist/step item inside a Day
const sopItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  order: { type: Number, default: 0 },
}, { _id: true })

// A day block (Day 1, Day 2, etc.)
const sopDaySchema = new mongoose.Schema({
  dayNumber: { type: Number, required: true },
  title: { type: String, default: '' },
  items: [sopItemSchema],
}, { _id: true })

const versionHistorySchema = new mongoose.Schema({
  version: Number,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now },
  changes: { type: String, default: '' },
  // Full snapshot of the document as of this version, captured right before
  // the edit that bumped the version. Powers Compare Versions / Restore Version.
  snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
})

const sopSchema = new mongoose.Schema({
  sopId: { type: String, unique: true },           // e.g. SOP-001
  title: { type: String, required: true },
  department: {
    type: String,
    enum: ['marketing', 'sales', 'operations', 'hr', 'technical', 'finance', 'client_success'],
    default: 'operations',
  },
  sopType: {
    type: String,
    enum: ['performance_marketing', 'linkedin'],
    default: 'performance_marketing',
    index: true,
  },
  description: { type: String, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft', index: true },
  archivedAt: Date,
  version: { type: Number, default: 1 },
  isTemplate: { type: Boolean, default: false, index: true },
  templateCategory: { type: String, default: '' },
  category: {
    type: String,
    enum: ['sales','marketing','meta_ads','google_ads','creative','design','video_editing','development','client_onboarding','finance','hr','seo','reporting','general'],
    default: 'general',
    index: true,
  },
  estimatedDuration: { type: String, default: '' },

  days: [sopDaySchema],
  tags: [String],
  versionHistory: [versionHistorySchema],
  bookmarkedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  viewCount: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true })

sopSchema.pre('save', async function (next) {
  if (!this.sopId) {
    const count = await this.constructor.countDocuments()
    this.sopId = `SOP-${String(count + 1).padStart(3, '0')}`
  }
  next()
})

module.exports = mongoose.model('SOP', sopSchema)
