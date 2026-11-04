'use strict';

const mongoose = require('mongoose');

/**
 * SalesFollowUp — scheduled follow-up entries for a SalesProspect.
 * Independent from the existing FollowUp model (which is scoped to Lead).
 */
const salesFollowUpSchema = new mongoose.Schema({
  prospectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesProspect',
    required: true,
    index: true,
  },
  scheduledAt: { type: Date, required: true },   // date + time
  mode: {
    type: String,
    enum: ['phone', 'whatsapp', 'email', 'meeting', 'video_call'],
    default: 'phone',
  },
  title:       { type: String, default: '' },
  notes:       { type: String, default: '' },
  outcome:     { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'overdue'],
    default: 'pending',
  },
  completedAt: { type: Date, default: null },

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true });

salesFollowUpSchema.index({ prospectId: 1, scheduledAt: 1 });
salesFollowUpSchema.index({ tenantId: 1, scheduledAt: 1 });
salesFollowUpSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('SalesFollowUp', salesFollowUpSchema);
