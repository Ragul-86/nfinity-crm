/**
 * ClientPortalUser.js
 * Portal-specific user accounts — separate from CRM staff accounts.
 * One per client contact; linked to a Client document.
 */
const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const clientPortalUserSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },

  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  phone:    { type: String, default: '' },
  avatar:   { type: String, default: '' },

  isActive:   { type: Boolean, default: true },
  lastLogin:  { type: Date },

  // Simple brute-force protection
  loginAttempts: { type: Number, default: 0 },
  lockUntil:     { type: Date },

  notificationPreferences: {
    invoice:   { type: Boolean, default: true },
    quotation: { type: Boolean, default: true },
    meeting:   { type: Boolean, default: true },
    task:      { type: Boolean, default: true },
    support:   { type: Boolean, default: true },
  },

  passwordResetToken:   { type: String, select: false },
  passwordResetExpires: { type: Date,   select: false },

}, { timestamps: true })

// One email per tenant
clientPortalUserSchema.index({ tenantId: 1, email: 1 }, { unique: true })

clientPortalUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

clientPortalUserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password)
}

clientPortalUserSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now()
}

module.exports = mongoose.model('ClientPortalUser', clientPortalUserSchema)
