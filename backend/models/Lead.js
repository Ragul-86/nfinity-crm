const mongoose = require('mongoose')

const leadNoteSchema = new mongoose.Schema({
  content: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

const leadSchema = new mongoose.Schema({
  // Auto-generated lead ID
  leadId: { type: String, unique: true, sparse: true, index: true },  // e.g. LEAD-00001

  // Core contact info
  name: { type: String, required: true },          // Contact Person
  company: { type: String, default: '' },           // Company Name
  brandName: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  website: { type: String, default: '' },
  industry: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  country: { type: String, default: '' },
  budget: { type: Number, default: 0 },
  serviceRequired: { type: String, default: '' },

  // Pipeline
  status: {
    type: String,
    enum: ['new_lead', 'contacted', 'discovery_call', 'proposal_sent', 'negotiation', 'won', 'lost', 'converted', 'archived'],
    default: 'new_lead',
    index: true,
  },
  kanbanOrder: { type: Number, default: 0 },  // for ordering within a column

  // Values
  value: { type: Number, default: 0 },   // Lead value / deal size
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  source: {
    type: String,
    enum: [
      'website', 'referral', 'social_media', 'cold_call', 'email', 'event', 'meta_ads',
      'lead_form', 'facebook_ads', 'instagram_ads', 'whatsapp', 'google_ads',
      'landing_page', 'import', 'api', 'webhook', 'manual', 'other',
    ],
    default: 'other',
  },

  // Lead Form link
  formId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadForm' },
  formSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadFormSubmission' },

  // Follow-up quick fields (lightweight — full follow-ups use FollowUp model)
  followUpDate: Date,
  followUpNotes: { type: String, default: '' },

  // Meta
  notes: [leadNoteSchema],
  lostReason: { type: String, default: '' },
  expectedCloseDate: Date,
  closedAt: Date,
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },  // optional: ties a lead to a specific campaign workspace
  convertedClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }, // set when won → client
  tags: [String],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true })

leadSchema.index({ status: 1, kanbanOrder: 1 })
leadSchema.index({ createdBy: 1 })
leadSchema.index({ campaign: 1 })
leadSchema.index({ tenantId: 1, createdAt: -1 })

// Auto-generate leadId before save
leadSchema.pre('save', async function (next) {
  if (this.isNew && !this.leadId) {
    try {
      const count = await mongoose.model('Lead').countDocuments({ tenantId: this.tenantId })
      this.leadId = `LEAD-${String(count + 1).padStart(5, '0')}`
    } catch {
      this.leadId = `LEAD-${Date.now()}`
    }
  }
  next()
})

module.exports = mongoose.model('Lead', leadSchema)
