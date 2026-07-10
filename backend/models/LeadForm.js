const mongoose = require('mongoose')
const crypto = require('crypto')

const formFieldSchema = new mongoose.Schema({
  id: { type: String, required: true },    // unique within form (e.g. "field_1")
  type: {
    type: String,
    required: true,
    enum: ['text', 'email', 'phone', 'number', 'textarea', 'select', 'checkbox', 'radio', 'date', 'file', 'hidden'],
  },
  label: { type: String, required: true },
  placeholder: { type: String, default: '' },
  required: { type: Boolean, default: false },
  order: { type: Number, default: 0 },

  // For select/checkbox/radio
  options: [String],

  // For hidden fields
  defaultValue: { type: String, default: '' },

  // Maps to Lead field (e.g. 'name', 'phone', 'email', 'company', 'city', etc.)
  // null = custom field stored in submission data only
  leadField: { type: String, default: null },
}, { _id: false })

const leadFormSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },

  fields: [formFieldSchema],

  // Public access token (used in public URL: /f/:token)
  publicToken: {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(12).toString('hex'),
  },

  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
  },

  settings: {
    thankYouMessage: { type: String, default: 'Thank you! We will contact you shortly.' },
    redirectUrl: { type: String, default: '' },       // redirect after submit (blank = show thank-you)
    preventDuplicates: { type: Boolean, default: true },
    duplicateField: {                                  // which field to check for duplicates
      type: String,
      enum: ['email', 'phone', 'none'],
      default: 'phone',
    },
    source: { type: String, default: 'lead_form' },   // default lead source for submissions
    defaultPriority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    defaultStatus: { type: String, default: 'new_lead' },
    // Auto-assignment
    assignmentMode: {
      type: String,
      enum: ['none', 'specific', 'round_robin'],
      default: 'none',
    },
    assignTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    roundRobinIndex: { type: Number, default: 0 },    // internal cursor for round-robin
  },

  // Aggregated stats (updated on each submission)
  submissionsCount: { type: Number, default: 0 },
  conversionsCount: { type: Number, default: 0 },  // submissions that became leads

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastSubmissionAt: Date,
}, { timestamps: true })

leadFormSchema.index({ tenantId: 1, status: 1 })

module.exports = mongoose.model('LeadForm', leadFormSchema)
