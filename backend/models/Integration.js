const mongoose = require('mongoose');

/**
 * Integration — stores third-party service connections per tenant.
 * Sensitive credential fields (tokens, keys, secrets) are stored encrypted
 * using AES-256-GCM via backend/utils/encryption.js.
 *
 * One integration document per (tenantId, provider) pair.
 * Each provider stores its own shape inside `credentials` (Mixed type).
 */
const integrationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['marketing', 'communication', 'google', 'payments', 'ai', 'developer'],
      required: true,
    },
    // Provider identifier, e.g. 'meta_ads', 'whatsapp', 'google', 'razorpay',
    // 'stripe', 'paypal', 'openai', 'claude', 'gemini', 'webhook'
    provider: { type: String, required: true },

    name: { type: String, required: true },

    status: {
      type: String,
      enum: ['disconnected', 'connected', 'pending', 'expired', 'failed', 'sync_error'],
      default: 'disconnected',
    },

    // Non-sensitive display configuration (safe to read/write without encryption)
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Sensitive credentials — each field is stored as { iv, encrypted, tag }
    // Shape varies per provider. Decrypted only server-side, never sent to client.
    credentials: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Sync scheduling
    syncSettings: {
      autoSync:        { type: Boolean, default: false },
      intervalMinutes: { type: Number, default: 60, min: 1 },
      lastSync:        { type: Date, default: null },
      nextSync:        { type: Date, default: null },
      lastSyncStatus:  { type: String, enum: ['success', 'failed', 'running', null], default: null },
      lastSyncError:   { type: String, default: null },
    },

    // OAuth state for PKCE / state param verification (short-lived, not sensitive)
    oauthState: { type: String, default: null },

    // Who connected this integration
    connectedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    connectedAt:    { type: Date, default: null },
    disconnectedAt: { type: Date, default: null },

    // Last test result
    lastTestedAt:   { type: Date, default: null },
    lastTestResult: { type: String, enum: ['passed', 'failed', null], default: null },
    lastTestError:  { type: String, default: null },

    // For webhook integrations
    webhookUrl:    { type: String, default: null },
    webhookSecret: { type: mongoose.Schema.Types.Mixed, default: null }, // encrypted

    isEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One integration per provider per tenant
integrationSchema.index({ tenantId: 1, provider: 1 }, { unique: true });
// Fast lookup by category
integrationSchema.index({ tenantId: 1, category: 1 });

module.exports = mongoose.model('Integration', integrationSchema);
