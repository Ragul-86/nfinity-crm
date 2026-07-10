const mongoose = require('mongoose')

const leadFormSubmissionSchema = new mongoose.Schema({
  form: { type: mongoose.Schema.Types.ObjectId, ref: 'LeadForm', required: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },

  data: { type: mongoose.Schema.Types.Mixed, required: true },  // { fieldId: value, ... }

  // Created lead (if submission converted to lead)
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  convertedToLead: { type: Boolean, default: false },

  // Spam / duplicate guard
  isDuplicate: { type: Boolean, default: false },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },

  // UTM / source tracking
  utmSource: { type: String, default: '' },
  utmMedium: { type: String, default: '' },
  utmCampaign: { type: String, default: '' },

  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true })

leadFormSubmissionSchema.index({ form: 1, submittedAt: -1 })
leadFormSubmissionSchema.index({ tenantId: 1, submittedAt: -1 })

module.exports = mongoose.model('LeadFormSubmission', leadFormSubmissionSchema)
