const LOG_CHANNEL_ID = "1374495867691597976";

async function logAction(client, message) {
  if (!LOG_CHANNEL_ID) return;
  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      await channel.send(message);
    }
  } catch (err) {
    console.error('Failed to log action:', err);
  }
}

module.exports = { logAction };
