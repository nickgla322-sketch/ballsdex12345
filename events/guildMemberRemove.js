const { EmbedBuilder } = require('discord.js');

const Teams = require('../models/teams');
const Staffs = require('../models/staffs');
const DepartedMembers = require('../models/departedMembers');
const { logAction } = require('../utils/logger');
const {
  ASSISTANT_MANAGER_ROLE,
  MANAGER_ROLE,
  CHAIRMAN_ROLE,
} = require('../utils/permissions');

const STAFF_ROLES = {
  assistant: ASSISTANT_MANAGER_ROLE,
  manager: MANAGER_ROLE,
  chairman: CHAIRMAN_ROLE,
};

const POSITION_NAMES = {
  assistant: 'Assistant Manager',
  manager: 'Manager',
  chairman: 'Chairman',
};

module.exports = {
  name: 'guildMemberRemove',

  async execute(member, client) {
    try {
      const [teams, staffEntries] = await Promise.all([
        Teams.find(),
        Staffs.find({ userId: member.id }),
      ]);

      const teamRolesHeld = new Set(
        teams
          .filter(team => member.roles.cache.has(team.roleId))
          .map(team => team.roleId)
      );

      const staffByTeam = new Map(
        staffEntries.map(entry => [entry.teamRoleId, entry])
      );

      // A staff database entry is also authoritative for their team membership.
      for (const entry of staffEntries) {
        teamRolesHeld.add(entry.teamRoleId);
      }

      if (teamRolesHeld.size === 0) return;

      const memberships = [];

      for (const teamRoleId of teamRolesHeld) {
        const team = teams.find(item => item.roleId === teamRoleId);
        if (!team) continue;

        const staffEntry = staffByTeam.get(teamRoleId);
        const position = staffEntry?.position || null;
        const staffRoleId = position ? STAFF_ROLES[position] : null;

        memberships.push({
          teamName: team.name || 'Unknown Team',
          teamRoleId,
          staffRoleId: staffRoleId || null,
          position,
        });
      }

      if (memberships.length === 0) return;

      await DepartedMembers.findOneAndUpdate(
        { guildId: member.guild.id, userId: member.id },
        { $set: { memberships } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('Team Member Left the Server')
        .setDescription(
          `**User:** <@!${member.id}> (\`${member.user.tag}\`)\n` +
          memberships.map(item =>
            `**Team:** <@&${item.teamRoleId}>\n**Position:** ${POSITION_NAMES[item.position] || (item.position ? item.position : 'Player')}`
          ).join('\n\n')
        )
        .setTimestamp();

      await logAction(client, {
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('Failed to process departing team member:', error);
    }
  },
};
