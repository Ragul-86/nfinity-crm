const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  type: {
    type: String,
    enum: ['google_ads', 'facebook_ads', 'instagram_ads', 'seo', 'email_marketing',
           'whatsapp_marketing', 'sms_marketing', 'linkedin', 'youtube_ads', 'social_media'],
    required: true,
  },
  objectives: { type: String, default: '' },
  budget: { type: Number, default: 0 },
  spend: { type: Number, default: 0 },
  roi: { type: Number, default: 0 },
  startDate: Date,
  endDate: Date,
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed', 'cancelled'],
    default: 'draft',
  },
  assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Legacy flat list — kept for backward compatibility, auto-derived from assignedTeam below.
  teamMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Hybrid Campaign Access Control: only users listed here get "work access"
  // (My Campaigns workspace). Everyone else (employees) gets read-only
  // visibility via the main Campaigns list. role is a free-text label such
  // as "Media Buyer", "Designer", "Account Manager".
  assignedTeam: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, default: '' },
  }],
  notes: [{
    text: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  }],
  assets: [{
    name: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
  analytics: {
    leadsGenerated: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    costPerLead: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
  },
  performanceTrend: [{
    date: Date,
    leads: Number,
    spend: Number,
    conversions: Number,
  }],
  description: { type: String, default: '' },
  tags: [String],
  isArchived: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true });

// Keep legacy teamMembers in sync with assignedTeam so any old code/queries
// referencing the flat list still work.
campaignSchema.pre('save', function (next) {
  if (this.isModified('assignedTeam')) {
    this.teamMembers = this.assignedTeam.map(t => t.user);
  }
  next();
});

module.exports = mongoose.model('Campaign', campaignSchema);
