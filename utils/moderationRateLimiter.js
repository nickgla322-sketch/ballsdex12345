const ModerationRateLimit = require('../models/moderationRateLimits');

const WINDOW_MS = 10 * 60 * 1000;
const MAX_EVENTS = 3;
const BLOCK_MS = 6 * 60 * 60 * 1000;

async function getActiveRateLimit(guildId, moderatorId, action) {
  const key = { guildId, moderatorId, action };
  const record = await ModerationRateLimit.findOne(key).select('blockedUntil events').lean();
  const now = Date.now();

  if (record?.blockedUntil && new Date(record.blockedUntil).getTime() > now) {
    return true;
  }

  const cutoff = new Date(now - WINDOW_MS);
  const recentEvents = (record?.events || []).filter(
    event => new Date(event.createdAt).getTime() >= cutoff.getTime(),
  );

  // The first three staff actions are allowed. The next attempt activates the
  // cooldown before the requested action can be carried out.
  if (recentEvents.length >= MAX_EVENTS) {
    await ModerationRateLimit.updateOne(
      key,
      { $set: { blockedUntil: new Date(now + BLOCK_MS) } },
    );
    return true;
  }

  return false;
}

async function recordRateEvent({ guildId, moderatorId, action, type, targetId }) {
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
}

module.exports = { getActiveRateLimit, recordRateEvent };
