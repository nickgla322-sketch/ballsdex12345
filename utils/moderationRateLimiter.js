const ModerationRateLimit = require('../models/moderationRateLimits');

const WINDOW_MS = 60 * 1000;
const BLOCK_MS = 12 * 60 * 60 * 1000;

async function getActiveRateLimit(guildId, moderatorId, action) {
  const record = await ModerationRateLimit.findOne({ guildId, moderatorId, action }).select('blockedUntil').lean();
  if (record?.blockedUntil && new Date(record.blockedUntil).getTime() > Date.now()) {
    return true;
  }
  return false;
}

async function recordRateEvent({ guildId, moderatorId, action, type, targetId, threshold }) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - WINDOW_MS);
  const key = { guildId, moderatorId, action };

  await ModerationRateLimit.updateOne(
    key,
    { $setOnInsert: key },
    { upsert: true },
  );
  await ModerationRateLimit.updateOne(
    key,
    {
      $pull: { events: { createdAt: { $lt: cutoff } } },
      $set: { updatedAt: now },
    },
  );
  await ModerationRateLimit.updateOne(
    key,
    {
      $push: {
        events: {
          $each: [{ type, targetId, createdAt: now }],
          $slice: -50,
        },
      },
    },
  );

  const record = await ModerationRateLimit.findOne(key).select('events').lean();
  const recentTargets = new Set(
    (record?.events || [])
      .filter(event => event.type === type && new Date(event.createdAt).getTime() >= cutoff.getTime())
      .map(event => event.targetId),
  );

  if (recentTargets.size >= threshold) {
    await ModerationRateLimit.updateOne(
      key,
      { $set: { blockedUntil: new Date(now.getTime() + BLOCK_MS) } },
    );
  }
}

module.exports = { getActiveRateLimit, recordRateEvent };
