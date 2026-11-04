'use strict';

const mongoose = require('mongoose');

/**
 * SalesActivity — activity log entries attached to a SalesProspect.
 * Types: call, meeting, email, note, stage_change, proposal, follow_up
 */
const salesActivitySchema = new mongoose.Schema({
  prospectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesProspect',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['call', 'meeting', 'email', 'note', 'stage_change', 'proposal', 'follow_up'],
    required: true,
  },
  description: { type: String, default: '' },
  outcome:     { type: String, default: '' },
  scheduledAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },

  // For stage_change entries
  fromStage: { type: String, default: null },
  toStage:   { type: String, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true });

salesActivitySchema.index({ prospectId: 1, createdAt: -1 });
salesActivitySchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('SalesActivity', salesActivitySchema);
