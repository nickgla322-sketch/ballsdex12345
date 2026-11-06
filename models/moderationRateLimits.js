const mongoose = require('mongoose');

const rateEventSchema = new mongoose.Schema({
  type: { type: String, required: true },
  targetId: { type: String, required: true },
  createdAt: { type: Date, required: true },
}, { _id: false });

const moderationRateLimitSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  moderatorId: { type: String, required: true },
  action: { type: String, required: true },
  events: { type: [rateEventSchema], default: [] },
  blockedUntil: { type: Date, default: null },
}, { timestamps: true });

moderationRateLimitSchema.index(
  { guildId: 1, moderatorId: 1, action: 1 },
  { unique: true },
);

module.exports = mongoose.model('ModerationRateLimit', moderationRateLimitSchema);
