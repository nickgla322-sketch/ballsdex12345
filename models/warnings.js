// Persistent warning points for league moderation.
const mongoose = require('mongoose');

const warningSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  points: { type: Number, default: 0 },
  warningCount: { type: Number, default: 0 },
}, { timestamps: true });

warningSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Warning', warningSchema);
