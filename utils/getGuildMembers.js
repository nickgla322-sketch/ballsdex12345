
const memberFetches = new Map();

async function getGuildMembers(guild) {
  const guildId = guild.id;

  // Reuse an existing fetch if one is already running
  if (memberFetches.has(guildId)) {
    return memberFetches.get(guildId);
  }

  const fetchPromise = guild.members.fetch()
    .catch(error => {
      // Allow another attempt if the fetch fails
      memberFetches.delete(guildId);
      throw error;
    });

  memberFetches.set(guildId, fetchPromise);

  return fetchPromise;
}

module.exports = getGuildMembers;
