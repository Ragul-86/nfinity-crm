const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted', 'trial'],
    default: 'active',
    index: true,
  },
  plan: {
    type: String,
    enum: ['trial', 'starter', 'professional', 'enterprise'],
    default: 'trial',
  },
  // The Client Super Admin who owns this workspace
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Company details
  company: {
    industry: { type: String, default: '' },
    website: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    logo: { type: String, default: '' },
  },

  // Subscription info
  subscription: {
    startDate: { type: Date, default: Date.now },
    endDate: Date,
    maxUsers: { type: Number, default: 10 },
    features: [String],
  },

  // Audit
  suspendedAt: Date,
  suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  suspendReason: { type: String, default: '' },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Notes from platform admin
  adminNotes: { type: String, default: '' },

  // Created by Platform Super Admin
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Generate slug from name
tenantSchema.pre('validate', function (next) {
  if (this.isNew && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

module.exports = mongoose.model('Tenant', tenantSchema);
