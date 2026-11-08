const mongoose = require('mongoose');

const demandCooldownSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  lastUsedAt: { type: Date, default: Date.now },
});

demandCooldownSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('DemandCooldown', demandCooldownSchema);
