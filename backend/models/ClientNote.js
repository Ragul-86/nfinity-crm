const mongoose = require('mongoose')

const editHistorySchema = new mongoose.Schema({
  content:  { type: String, required: true },
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  editedAt: { type: Date, default: Date.now },
}, { _id: false })

const clientNoteSchema = new mongoose.Schema({
  client:      { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
  content:     { type: String, required: true },
  author:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  pinned:      { type: Boolean, default: false, index: true },
  editHistory: [editHistorySchema],
}, { timestamps: true })

clientNoteSchema.index({ client: 1, createdAt: -1 })
clientNoteSchema.index({ client: 1, pinned: -1 })

module.exports = mongoose.model('ClientNote', clientNoteSchema)
