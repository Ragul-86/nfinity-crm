const mongoose = require('mongoose');
const crypto = require('crypto');

const invitationSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, default: '' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: {
    type: String,
    enum: ['admin', 'manager', 'employee', 'viewer'],
    default: 'employee',
  },

  // Secure token (stored as hash, sent in plain form)
  token: { type: String, required: true },
  tokenHash: { type: String, required: true },

  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired', 'revoked'],
    default: 'pending',
    index: true,
  },

  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    index: true,
  },

  acceptedAt: Date,
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto-expire via TTL is not used here (we handle it in logic).
// Index for fast token lookup
invitationSchema.index({ tokenHash: 1 });
invitationSchema.index({ tenantId: 1, email: 1 });

module.exports = mongoose.model('Invitation', invitationSchema);
