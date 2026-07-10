const mongoose = require('mongoose');

const taskCommentSchema = new mongoose.Schema({
  content: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'in_progress', 'review', 'completed', 'cancelled', 'blocked'], default: 'pending' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  sop: { type: mongoose.Schema.Types.ObjectId, ref: 'SOP' },
  sopAssignment: { type: mongoose.Schema.Types.ObjectId, ref: 'SOPAssignment' },
  notes: { type: String, default: '' },
  startDate: Date,
  dueDate: Date,
  completedAt: Date,
  completionDate: Date,
  dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  isRecurring: { type: Boolean, default: false },
  recurringPattern: {
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'] },
    interval: Number,
    endDate: Date,
  },
  attachments: [{
    name: String,
    fileUrl: String,
    uploadedAt: { type: Date, default: Date.now },
  }],
  comments: [taskCommentSchema],
  tags: [String],
  estimatedHours: { type: Number, default: 0 },
  loggedHours: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
