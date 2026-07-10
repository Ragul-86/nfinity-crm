const mongoose = require('mongoose');

/**
 * Stores the editable permission matrix for platform roles.
 * One document per role key, containing a map of module → actions array.
 */
const platformPermissionSchema = new mongoose.Schema(
  {
    roleKey:  { type: String, required: true, unique: true, trim: true },
    matrix:   { type: mongoose.Schema.Types.Mixed, default: {} },
    // matrix shape: { Dashboard: ['view','create'], Leads: ['view','create','edit','delete'], ... }
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformPermission', platformPermissionSchema);
