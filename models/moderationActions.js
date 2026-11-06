const mongoose = require('mongoose');

const moderationActionSchema = new mongoose.Schema({
  caseId: { type: Number, required: true, unique: true, index: true },
  guildId: { type: String, required: true, index: true },
  moderatorId: { type: String, required: true, index: true },
  action: { type: String, required: true, index: true },
  targetId: { type: String, default: null, index: true },
  reason: { type: String, default: null },
  details: { type: String, default: null },
  channelId: { type: String, default: null },
}, { timestamps: true });

moderationActionSchema.index({ guildId: 1, createdAt: -1 });
moderationActionSchema.index({ guildId: 1, moderatorId: 1, createdAt: -1 });
moderationActionSchema.index({ guildId: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('ModerationAction', moderationActionSchema);
