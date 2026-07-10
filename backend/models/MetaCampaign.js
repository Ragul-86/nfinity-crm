const mongoose = require('mongoose')

const metaCampaignSchema = new mongoose.Schema({
  campaignId: { type: String, unique: true },
  campaignName: { type: String, required: true },
  platform: { type: String, enum: ['facebook', 'instagram', 'both'], default: 'both' },
  adSpend: { type: Number, default: 0 },
  revenueGenerated: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  lastSynced: Date,
}, { timestamps: true })

module.exports = mongoose.model('MetaCampaign', metaCampaignSchema)
