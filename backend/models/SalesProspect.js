'use strict';

const mongoose = require('mongoose');

// ─── Stage change history entry ───────────────────────────────────────────────
const stageHistorySchema = new mongoose.Schema({
  fromStage:  { type: String, default: null },
  toStage:    { type: String, required: true },
  changedAt:  { type: Date,   default: Date.now },
  changedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:      { type: String, default: '' },
}, { _id: false });

// ─── Proposal sub-document ────────────────────────────────────────────────────
const proposalSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'rejected'],
    default: 'draft',
  },
  sentDate:  { type: Date,   default: null },
  amount:    { type: Number, default: 0 },
  notes:     { type: String, default: '' },
}, { _id: false });

// ─── Main SalesProspect schema ────────────────────────────────────────────────
const salesProspectSchema = new mongoose.Schema({

  // ── Company Information ───────────────────────────────────────────────────
  companyName:     { type: String, required: true, trim: true },
  contactPerson:   { type: String, required: true, trim: true },
  phone:           { type: String, default: '' },
  email:           { type: String, default: '', lowercase: true, trim: true },
  website:         { type: String, default: '' },
  industry:        { type: String, default: '' },
  businessLocation:{ type: String, default: '' },

  // ── Sales Information ─────────────────────────────────────────────────────
  interestedServices: [{
    type: String,
    enum: [
      'ads_management', 'website_development', 'digital_marketing',
      'seo', 'social_media_management', 'performance_marketing',
    ],
  }],
  dealType: {
    type: String,
    enum: ['monthly_retainer', 'one_time_project'],
    default: 'monthly_retainer',
  },
  estimatedDealValue:  { type: Number, default: 0 },
  expectedClosingDate: { type: Date,   default: null },
  assignedSalesperson: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  leadSource: {
    type: String,
    enum: [
      'website', 'referral', 'social_media', 'cold_call', 'email',
      'event', 'whatsapp', 'networking', 'existing_client', 'other',
    ],
    default: 'other',
  },

  // ── Pipeline Stage ────────────────────────────────────────────────────────
  stage: {
    type: String,
    enum: [
      'new_prospect', 'contacted', 'meeting_scheduled',
      'proposal_sent', 'negotiation', 'won', 'lost',
    ],
    default: 'new_prospect',
    index: true,
  },
  stageHistory: [stageHistorySchema],
  kanbanOrder:  { type: Number, default: 0 },

  // ── Follow-up Information ─────────────────────────────────────────────────
  nextFollowUpDate: { type: Date,   default: null },
  followUpTime:     { type: String, default: '' },   // e.g. "10:30"
  followUpNotes:    { type: String, default: '' },

  // ── Proposal ──────────────────────────────────────────────────────────────
  proposal: { type: proposalSchema, default: () => ({}) },

  // ── Notes & Remarks ───────────────────────────────────────────────────────
  notes:   { type: String, default: '' },
  remarks: { type: String, default: '' },

  // ── Won / Lost ────────────────────────────────────────────────────────────
  lostReason: {
    type: String,
    enum: [
      'budget_constraints', 'went_with_competitor', 'no_response',
      'service_mismatch', 'project_delayed', 'out_of_scope', 'other', '',
    ],
    default: '',
  },
  lostNotes:         { type: String, default: '' },
  wonAt:             { type: Date,   default: null },
  lostAt:            { type: Date,   default: null },

  // ── Convert to Client ─────────────────────────────────────────────────────
  convertedClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  convertedAt:       { type: Date, default: null },

  // ── Meta ──────────────────────────────────────────────────────────────────
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
salesProspectSchema.index({ tenantId: 1, stage: 1 });
salesProspectSchema.index({ tenantId: 1, createdAt: -1 });
salesProspectSchema.index({ tenantId: 1, assignedSalesperson: 1 });
salesProspectSchema.index({ tenantId: 1, expectedClosingDate: 1 });

module.exports = mongoose.model('SalesProspect', salesProspectSchema);
