/**
 * PipelineMapping.js
 *
 * Maps an incoming lead's attributes (adId, metaFormId, sheetName, source)
 * to a specific Pipeline within the same tenant.
 *
 * When a lead arrives via Google Sheet webhook or Meta, the system:
 *   1. Looks up PipelineMapping for the tenant where any match criterion fits.
 *   2. If found, assigns the lead to that pipeline (and optional override stage).
 *   3. If not found, assigns the lead to the tenant's default pipeline.
 *
 * Multi-tenant: every document is scoped to tenantId.
 * Ownership is enforced at the controller level.
 */

const mongoose = require('mongoose');

const pipelineMappingSchema = new mongoose.Schema({
  tenantId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Tenant',
    required: true,
    index:    true,
  },

  pipelineId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Pipeline',
    required: true,
  },

  // ── Match criteria (at least one should be set) ───────────────────────────
  // Any non-null field is matched against the incoming lead's corresponding field.
  // The first matching mapping wins (checked in priority: adId > metaFormId > sheetName > source).

  adId:       { type: String, default: null },   // Meta ad_id
  adName:     { type: String, default: null },   // Meta ad_name (less reliable, use adId when possible)
  metaFormId: { type: String, default: null },   // Meta form_id
  sheetName:  { type: String, default: null },   // Google Sheet tab name
  source:     { type: String, default: null },   // Lead source field (e.g. 'facebook_ads')

  // Optional: override which stage the lead starts in.
  // If null, uses the pipeline's first OPEN stage.
  stageId: { type: mongoose.Schema.Types.ObjectId, default: null },

  // Human-readable label for the mapping (e.g. "Hiring Ad → Recruitment Pipeline")
  label: { type: String, default: '' },

  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// ── Indexes for fast lookup on incoming webhooks ──────────────────────────────
pipelineMappingSchema.index({ tenantId: 1, adId: 1 });
pipelineMappingSchema.index({ tenantId: 1, metaFormId: 1 });
pipelineMappingSchema.index({ tenantId: 1, sheetName: 1 });
pipelineMappingSchema.index({ tenantId: 1, source: 1 });
pipelineMappingSchema.index({ tenantId: 1, isActive: 1 });

module.exports = mongoose.model('PipelineMapping', pipelineMappingSchema);
