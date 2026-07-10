const mongoose = require('mongoose');

// Default permission matrix per role
// Used as fallback when no tenant-specific override is stored
const DEFAULT_PERMISSIONS = {
  super_admin: {
    dashboard:   { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: true,  approve: true },
    leads:       { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: true,  approve: true },
    pipeline:    { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: true,  approve: true },
    customers:   { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: true,  approve: true },
    campaigns:   { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: true,  approve: true },
    sop:         { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: true,  approve: true },
    tasks:       { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: true,  approve: true },
    attendance:  { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: false, approve: true },
    reports:     { view: true,  create: false, edit: false, delete: false, export: true,  assign: false, approve: false },
    analytics:   { view: true,  create: false, edit: false, delete: false, export: true,  assign: false, approve: false },
    settings:    { view: true,  create: true,  edit: true,  delete: true,  export: false, assign: false, approve: false },
    team:        { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: true,  approve: true },
  },
  admin: {
    dashboard:   { view: true,  create: true,  edit: true,  delete: false, export: true,  assign: true,  approve: false },
    leads:       { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: true,  approve: false },
    pipeline:    { view: true,  create: true,  edit: true,  delete: false, export: true,  assign: true,  approve: false },
    customers:   { view: true,  create: true,  edit: true,  delete: false, export: true,  assign: true,  approve: false },
    campaigns:   { view: true,  create: true,  edit: true,  delete: false, export: true,  assign: true,  approve: false },
    sop:         { view: true,  create: true,  edit: true,  delete: false, export: true,  assign: true,  approve: false },
    tasks:       { view: true,  create: true,  edit: true,  delete: true,  export: true,  assign: true,  approve: false },
    attendance:  { view: true,  create: false, edit: true,  delete: false, export: true,  assign: false, approve: true },
    reports:     { view: true,  create: false, edit: false, delete: false, export: true,  assign: false, approve: false },
    analytics:   { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    settings:    { view: false, create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    team:        { view: true,  create: false, edit: false, delete: false, export: false, assign: true,  approve: false },
  },
  manager: {
    dashboard:   { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    leads:       { view: true,  create: true,  edit: true,  delete: false, export: true,  assign: true,  approve: false },
    pipeline:    { view: true,  create: true,  edit: true,  delete: false, export: false, assign: true,  approve: false },
    customers:   { view: true,  create: true,  edit: true,  delete: false, export: false, assign: true,  approve: false },
    campaigns:   { view: true,  create: false, edit: true,  delete: false, export: false, assign: true,  approve: false },
    sop:         { view: true,  create: false, edit: false, delete: false, export: false, assign: true,  approve: false },
    tasks:       { view: true,  create: true,  edit: true,  delete: false, export: false, assign: true,  approve: false },
    attendance:  { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    reports:     { view: true,  create: false, edit: false, delete: false, export: true,  assign: false, approve: false },
    analytics:   { view: false, create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    settings:    { view: false, create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    team:        { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
  },
  employee: {
    dashboard:   { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    leads:       { view: true,  create: false, edit: true,  delete: false, export: false, assign: false, approve: false },
    pipeline:    { view: false, create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    customers:   { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    campaigns:   { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    sop:         { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    tasks:       { view: true,  create: false, edit: true,  delete: false, export: false, assign: false, approve: false },
    attendance:  { view: true,  create: true,  edit: false, delete: false, export: false, assign: false, approve: false },
    reports:     { view: false, create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    analytics:   { view: false, create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    settings:    { view: false, create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    team:        { view: false, create: false, edit: false, delete: false, export: false, assign: false, approve: false },
  },
  viewer: {
    dashboard:   { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    leads:       { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    pipeline:    { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    customers:   { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    campaigns:   { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    sop:         { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    tasks:       { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    attendance:  { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    reports:     { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    analytics:   { view: true,  create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    settings:    { view: false, create: false, edit: false, delete: false, export: false, assign: false, approve: false },
    team:        { view: false, create: false, edit: false, delete: false, export: false, assign: false, approve: false },
  },
};

const actionSchema = {
  view:    { type: Boolean, default: false },
  create:  { type: Boolean, default: false },
  edit:    { type: Boolean, default: false },
  delete:  { type: Boolean, default: false },
  export:  { type: Boolean, default: false },
  assign:  { type: Boolean, default: false },
  approve: { type: Boolean, default: false },
};

const moduleSchema = { type: actionSchema, default: undefined };

const permissionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  role: {
    type: String,
    enum: ['admin', 'manager', 'employee', 'viewer'],
    required: true,
  },
  modules: {
    dashboard:  { type: actionSchema },
    leads:      { type: actionSchema },
    pipeline:   { type: actionSchema },
    customers:  { type: actionSchema },
    campaigns:  { type: actionSchema },
    sop:        { type: actionSchema },
    tasks:      { type: actionSchema },
    attendance: { type: actionSchema },
    reports:    { type: actionSchema },
    analytics:  { type: actionSchema },
    settings:   { type: actionSchema },
    team:       { type: actionSchema },
  },
}, { timestamps: true });

permissionSchema.index({ tenantId: 1, role: 1 }, { unique: true });

const Permission = mongoose.model('Permission', permissionSchema);

module.exports = { Permission, DEFAULT_PERMISSIONS };
