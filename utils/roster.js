const getGuildMembers = require('./getGuildMembers');

const ROSTER_MAX = 14;
const activeTeams = new Set();

/**
 * Runs a roster-adding action only if the team has room.
 * The shared lock prevents /sign and /appoint from exceeding the cap
 * when both commands are used at nearly the same time.
 */
async function withRosterSlot(guild, teamRoleId, action) {
  if (activeTeams.has(teamRoleId)) {
    return { ok: false, busy: true };
  }

  activeTeams.add(teamRoleId);

  try {
    await getGuildMembers(guild);

    const role = await guild.roles.fetch(teamRoleId);

    if (!role) {
      throw new Error(`Team role ${teamRoleId} could not be found.`);
    }

    const currentCount = role.members.size;

    if (currentCount >= ROSTER_MAX) {
      return { ok: false, full: true, count: currentCount };
    }

    await action();

    const updatedRole = guild.roles.cache.get(teamRoleId) || role;

    return {
      ok: true,
      count: updatedRole.members.size,
      max: ROSTER_MAX,
    };
  } finally {
    activeTeams.delete(teamRoleId);
  }
}

module.exports = {
  ROSTER_MAX,
  withRosterSlot,
};
