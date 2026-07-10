const mongoose = require('mongoose');

const platformRoleSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    roleType:    { type: String, enum: ['system','custom','workspace'], default: 'custom' },
    status:      { type: String, enum: ['active','inactive'], default: 'active' },
    permissions: [{ type: String }],   // e.g. ['leads.*', 'reports.view']
    isSystem:    { type: Boolean, default: false },
    color:       { type: String, default: 'bg-primary' },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PlatformRole', platformRoleSchema);
