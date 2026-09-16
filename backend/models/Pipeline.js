/**
 * Pipeline.js
 *
 * Represents a pipeline for a tenant (workspace).
 * Each pipeline has embedded stages with semantic types (open, won, lost).
 *
 * Architecture:
 *   Workspace → Pipeline(s) → Stages → Leads
 *
 * Multi-tenant: every document is scoped to a tenantId.
 * Only one pipeline per tenant can have isDefault = true.
 */

const mongoose = require('mongoose');

// ── Stage subdocument ─────────────────────────────────────────────────────────
const stageSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  key:         { type: String, trim: true },
  order:       { type: Number, default: 0 },
  // Semantic type for reporting: open (in progress) / won / lost
  type:        { type: String, enum: ['open', 'won', 'lost'], default: 'open' },
  color:       { type: String, default: '#6366f1' },
  probability: { type: Number, default: 0, min: 0, max: 100 },

  // ── Conversion action ──────────────────────────────────────────────────────
  // Controls what happens when a lead reaches this stage.
  // This is INDEPENDENT of stage type — a "Won" stage in a Recruitment pipeline
  // should NOT create a Client (Hired ≠ Client). Only explicitly configured
  // stages trigger conversion.
  //
  //   'none'              — no action (safe default for ALL stages)
  //   'convert_to_client' — offer Lead → Client conversion in the pipeline UI
  //
  // Configuration is per-stage, per-pipeline, per-tenant.
  // Never determined by stage name or stage type alone.
  conversionAction: {
    type:    String,
    enum:    ['none', 'convert_to_client'],
    default: 'none',
  },
}, { _id: true });  // Each stage gets its own _id for Lead.stageId references

// ── Pipeline schema ───────────────────────────────────────────────────────────
const pipelineSchema = new mongoose.Schema({
  // Owner workspace — every query must be scoped to this
  tenantId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Tenant',
    required: true,
    index:    true,
  },

  // Display name (must be unique within a tenant)
  name: { type: String, required: true, trim: true },

  // Machine-friendly identifier (e.g. 'sales', 'recruitment')
  key: { type: String, trim: true, default: '' },

  // Source industry template key (e.g. 'recruitment_hr', 'digital_marketing')
  industry: { type: String, default: '' },

  description: { type: String, default: '' },

  // True = default pipeline for this workspace.
  // When a new lead arrives without an explicit pipeline mapping, it goes here.
  // Enforced at the application layer: only one pipeline per tenant should be true.
  isDefault: { type: Boolean, default: false, index: true },

  // Soft delete / deactivate instead of hard delete
  isActive: { type: Boolean, default: true, index: true },

  // Embedded stages — ordered by `order` field
  stages: [stageSchema],

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// ── Compound indexes ──────────────────────────────────────────────────────────
// Unique pipeline name per tenant
pipelineSchema.index({ tenantId: 1, name: 1 }, { unique: true });
// Fast lookup of default pipeline
pipelineSchema.index({ tenantId: 1, isDefault: 1, isActive: 1 });

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return the first stage with type 'open', or the very first stage.
 * Used to place new leads into their initial stage.
 */
pipelineSchema.methods.firstOpenStage = function () {
  if (!this.stages || this.stages.length === 0) return null;
  const sorted = [...this.stages].sort((a, b) => a.order - b.order);
  return sorted.find(s => s.type === 'open') || sorted[0];
};

/**
 * Return all stages sorted by order.
 */
pipelineSchema.methods.sortedStages = function () {
  return [...(this.stages || [])].sort((a, b) => a.order - b.order);
};

module.exports = mongoose.model('Pipeline', pipelineSchema);
