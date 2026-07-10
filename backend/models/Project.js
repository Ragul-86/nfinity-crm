const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  title: String,
  dueDate: Date,
  isCompleted: { type: Boolean, default: false },
  completedAt: Date,
});

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  status: { type: String, enum: ['planning', 'in_progress', 'on_hold', 'completed'], default: 'planning' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  startDate: Date,
  endDate: Date,
  budget: { type: Number, default: 0 },
  budgetSpent: { type: Number, default: 0 },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  teamMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  milestones: [milestoneSchema],
  attachments: [{
    name: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
  tags: [String],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
