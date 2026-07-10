/**
 * AISettings.js — per-tenant AI Copilot configuration
 * API key is stored in DB but never returned in responses (select: false).
 * hasKey / keyLastFour are safe to expose to clients.
 */
const mongoose = require('mongoose')

const aiSettingsSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    unique: true,
    index: true,
  },
  enabled: { type: Boolean, default: false },
  provider: {
    type: String,
    enum: ['claude', 'openai', 'gemini'],
    default: 'claude',
  },
  // Never returned by default — use .select('+apiKey') when you need it
  apiKey: { type: String, default: '', select: false },
  hasKey: { type: Boolean, default: false },       // safe to expose
  keyLastFour: { type: String, default: '' },      // safe to expose
  model: { type: String, default: '' },
  temperature: { type: Number, default: 0.7, min: 0, max: 2 },
  maxTokens: { type: Number, default: 1024, min: 100, max: 8000 },
  // Usage limits per user
  dailyLimitPerUser:   { type: Number, default: 50 },
  monthlyLimitPerUser: { type: Number, default: 500 },
  // Role-based access (which roles may use AI)
  rolePermissions: {
    platform_super_admin: { type: Boolean, default: true },
    client_super_admin:   { type: Boolean, default: true },
    super_admin:          { type: Boolean, default: true },
    admin:                { type: Boolean, default: true },
    manager:              { type: Boolean, default: true },
    employee:             { type: Boolean, default: false },
    viewer:               { type: Boolean, default: false },
  },
}, { timestamps: true })

module.exports = mongoose.model('AISettings', aiSettingsSchema)
