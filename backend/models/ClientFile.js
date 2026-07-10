const mongoose = require('mongoose')

const clientFileSchema = new mongoose.Schema({
  client:    { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, sparse: true },
  name:      { type: String, required: true },
  fileUrl:   { type: String, required: true },
  fileType:  { type: String, default: '' },
  size:      { type: Number, default: 0 },
  folder: {
    type: String,
    enum: ['contracts', 'invoices', 'quotations', 'gst', 'pan', 'creatives', 'reports', 'ads', 'campaign_files', 'general'],
    default: 'general',
    index: true,
  },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

clientFileSchema.index({ client: 1, folder: 1 })

module.exports = mongoose.model('ClientFile', clientFileSchema)
