const mongoose = require('mongoose')

const attendeeSchema = new mongoose.Schema({
  name:   String,
  email:  String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false })

const meetingSchema = new mongoose.Schema({
  client:     { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
  lead:       { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
  title:      { type: String, required: true },
  date:       { type: Date, required: true },
  duration:   { type: Number, default: 60 },   // minutes
  attendees:  [attendeeSchema],
  agenda:     { type: String, default: '' },
  summary:    { type: String, default: '' },   // kept for backward compat
  notes:      { type: String, default: '' },   // new: meeting notes
  outcome:    { type: String, default: '' },   // new: meeting outcome
  nextAction: { type: String, default: '' },
  status:     { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
  files:      [{ name: String, fileUrl: String }],
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

meetingSchema.index({ client: 1, date: -1 })

module.exports = mongoose.model('Meeting', meetingSchema)
