const mongoose = require('mongoose');

/**
 * LeadStream — saved dashboard/view configuration for a lead source stream.
 *
 * A LeadStream is purely a FILTER + DISPLAY CONFIG.
 * It contains NO lead records and does NOT duplicate any data.
 * The actual leads are always read from the Lead collection,
 * filtered by the criteria stored here.
 *
 * filterType drives which filter fields are used:
 *   meta_form  → filter.metaFormId
 *   sheet_tab  → filter.sheetName  (covers both google_sheet + google_sheets)
 *   source     → filter.source
 *   campaign   → filter.campaignId
 *   custom     → any combination of filter fields
 */
const leadStreamSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },

    // ── Display metadata ───────────────────────────────────────────────
    name:  { type: String, required: true, trim: true, maxlength: 120 },
    icon:  { type: String, default: '📋', trim: true },
    color: { type: String, default: '#6366f1', trim: true },
    order: { type: Number, default: 0 },

    // ── Stream type ────────────────────────────────────────────────────
    filterType: {
      type: String,
      enum: ['meta_form', 'sheet_tab', 'source', 'campaign', 'custom'],
      required: true,
    },

    // ── Filter criteria — exactly the Lead model fields ────────────────
    // At least one should be set. Never store lead IDs here.
    filter: {
      metaFormId:     { type: String },   // for filterType='meta_form'
      metaFormName:   { type: String },   // human-readable label
      sheetName:      { type: String },   // for filterType='sheet_tab'
      externalSource: { type: String },   // 'google_sheet'|'google_sheets'|null(=both)
      source:         { type: String },   // for filterType='source'
      campaignId:     { type: String },   // for filterType='campaign'
      campaignName:   { type: String },
    },

    // ── Lifecycle ──────────────────────────────────────────────────────
    isActive:    { type: Boolean, default: true },
    isPinned:    { type: Boolean, default: false },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    autoCreated: { type: Boolean, default: false }, // true = system-seeded from discovery
  },
  { timestamps: true }
);

// Compound indexes for fast tenant-scoped lookups
leadStreamSchema.index({ tenantId: 1, filterType: 1 });
leadStreamSchema.index({ tenantId: 1, isPinned: -1, order: 1 });

module.exports = mongoose.model('LeadStream', leadStreamSchema);
