const mongoose = require('mongoose');

/**
 * PlatformFeature
 * Stores per-key enabled/disabled overrides for platform-level feature flags.
 * One document per feature key. If a key has no document, the DEFAULT is used.
 */
const platformFeatureSchema = new mongoose.Schema(
  {
    key:       { type: String, required: true, unique: true, trim: true },
    enabled:   { type: Boolean, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformFeature', platformFeatureSchema);
