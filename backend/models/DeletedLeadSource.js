/**
 * DeletedLeadSource.js
 *
 * Tombstone collection. When a CRM Lead that originated from Google Sheets is deleted,
 * we write a record here so the automatic sync never recreates it.
 *
 * Lookup key for dedup: tenantId + externalSource + externalLeadId
 * (spreadsheetId is stored for diagnostics / future allow-list restore).
 */

const mongoose = require('mongoose');

const DeletedLeadSourceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    externalSource: {
      type: String,
      required: true,
      default: 'google_sheets',
    },
    spreadsheetId: {
      type: String,
      default: '',
    },
    sheetName: {
      type: String,
      default: '',
    },
    externalLeadId: {
      type: String,
      required: true,
    },
    deletedAt: {
      type: Date,
      default: Date.now,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: false, collection: 'deletedleadsources' }
);

// Primary dedup lookup
DeletedLeadSourceSchema.index(
  { tenantId: 1, externalSource: 1, externalLeadId: 1 },
  { unique: true }
);

// Secondary lookup (by spreadsheetId if needed)
DeletedLeadSourceSchema.index({ tenantId: 1, spreadsheetId: 1 });

module.exports = mongoose.model('DeletedLeadSource', DeletedLeadSourceSchema);
