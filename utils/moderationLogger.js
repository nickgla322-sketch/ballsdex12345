const { randomInt } = require('crypto');
const ModerationAction = require('../models/moderationActions');

async function logModerationAction(data) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await ModerationAction.create({
        ...data,
        caseId: randomInt(100000, 1000000),
      });
    } catch (error) {
      if (error.code !== 11000 || attempt === 4) {
        console.error('Failed to save moderation action:', error);
        return null;
      }
    }
  }
  return null;
}

module.exports = { logModerationAction };
