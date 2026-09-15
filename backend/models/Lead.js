const mongoose = require('mongoose')

const leadNoteSchema = new mongoose.Schema({
  content: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

const leadSchema = new mongoose.Schema({
  // Auto-generated lead ID
  leadId: { type: String, unique: true, sparse: true, index: true },  // e.g. LEAD-00001

  // External identifier for de-duplication (Google Sheet lead_id, etc.)
  externalLeadId: { type: String, default: null, sparse: true },
  externalSource: { type: String, default: null },  // e.g. 'google_sheet'

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

  // Dynamic fields from external sources (Google Sheet columns, Meta form answers, etc.)
  // Stores any column that does not map to a standard Lead field.
  // Shape varies per import source — never contains credentials or security tokens.
  customFields: { type: mongoose.Schema.Types.Mixed, default: {} },

  // ── Pipeline / Stage assignment ────────────────────────────────────────────
  // Added for flexible multi-pipeline support. Backward-compatible:
  // existing leads without these fields continue to use the `status` enum.
  pipelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pipeline', default: null, index: true },
  stageId:    { type: mongoose.Schema.Types.ObjectId, default: null },   // _id of embedded stage in Pipeline
  stageName:  { type: String, default: null },                           // denormalized for display / fast queries
  stageType:  { type: String, enum: ['open', 'won', 'lost'], default: 'open' },

  // Meta / Google Sheet ad attribution — top-level for efficient filtering and indexing.
  // Populated by the gsheetWebhook controller; distinct from the CRM Campaign ObjectId ref.
  adId:        { type: String, default: null },  // Meta ad_id
  adName:      { type: String, default: null },  // Meta ad_name
  adSetId:     { type: String, default: null },  // Meta adset_id
  adSetName:   { type: String, default: null },  // Meta adset_name
  campaignId:  { type: String, default: null },  // Meta campaign_id (string, not ObjectId)
  campaignName:{ type: String, default: null },  // Meta campaign_name (string, not ObjectId ref)
  metaFormId:  { type: String, default: null },  // Meta form_id (string; distinct from CRM formId ObjectId)
  metaFormName:{ type: String, default: null },  // Meta form_name
  sheetName:   { type: String, default: null },  // Source Google Sheet tab name

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true })

leadSchema.index({ status: 1, kanbanOrder: 1 })
leadSchema.index({ createdBy: 1 })
leadSchema.index({ campaign: 1 })
leadSchema.index({ tenantId: 1, createdAt: -1 })
leadSchema.index({ tenantId: 1, externalLeadId: 1 }, { sparse: true })
leadSchema.index({ tenantId: 1, adId: 1 }, { sparse: true })
leadSchema.index({ tenantId: 1, campaignId: 1 }, { sparse: true })
leadSchema.index({ tenantId: 1, pipelineId: 1 }, { sparse: true })
leadSchema.index({ tenantId: 1, pipelineId: 1, stageId: 1 }, { sparse: true })

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
