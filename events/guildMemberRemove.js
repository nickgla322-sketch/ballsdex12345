const { EmbedBuilder } = require('discord.js');
const Teams = require('../models/teams');
const Staffs = require('../models/staffs');
const DepartedMembers = require('../models/departedMembers');

const LEAVE_LOG_CHANNEL_ID = '1374495742151884810';

function getStaffRoleId(position) {
  switch (position) {
    case 'assistant': return '1374495166651437169';
    case 'manager': return '1374495160632610918';
    case 'chairman': return '1374495155310297099';
    default: return null;
  }
}

function prettyPosition(position) {
  switch (position) {
    case 'assistant': return 'Assistant Manager';
    case 'manager': return 'Manager';
    case 'chairman': return 'Chairman';
    default: return 'Player';
  }
}

module.exports = {
  name: 'guildMemberRemove',

  async execute(member, client) {
    try {
      const [teams, staffEntries] = await Promise.all([
        Teams.find(),
        Staffs.find({ userId: member.id }),
      ]);

      const staffByTeam = new Map(
        staffEntries.map(entry => [entry.teamRoleId, entry])
      );
      const teamByRole = new Map(teams.map(team => [team.roleId, team]));
      const memberships = new Map();

      for (const team of teams) {
        if (member.roles.cache.has(team.roleId)) {
          const staff = staffByTeam.get(team.roleId);
          memberships.set(team.roleId, {
            teamRoleId: team.roleId,
            teamName: team.name,
            staffRoleId: staff ? getStaffRoleId(staff.position) : null,
            position: staff?.position || null,
          });
        }
      }

      // Keep a staff membership even if the team role was missing from cache.
      for (const staff of staffEntries) {
        const team = teamByRole.get(staff.teamRoleId);
        memberships.set(staff.teamRoleId, {
          teamRoleId: staff.teamRoleId,
          teamName: team?.name || staff.teamName || 'Unknown Team',
          staffRoleId: getStaffRoleId(staff.position),
          position: staff.position || null,
        });
      }

      if (memberships.size === 0) return;

      const savedMemberships = [...memberships.values()];

      await DepartedMembers.findOneAndUpdate(
        { guildId: member.guild.id, userId: member.id },
        {
          $set: {
            memberships: savedMemberships,
            departedAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('Team Member Left the Server')
        .setDescription(`<@${member.id}> (${member.user.tag}) left the server.`)
        .addFields(
          savedMemberships.map(saved => ({
            name: saved.teamName,
            value: `Role: **${prettyPosition(saved.position)}**`,
            inline: false,
          }))
        )
        .setTimestamp();

      const channel = await client.channels.fetch(LEAVE_LOG_CHANNEL_ID).catch(() => null);
      if (channel?.isTextBased() && channel.send) {
        await channel.send({
          embeds: [embed],
          allowedMentions: { parse: [] },
        });
      } else {
        console.error('Team departure log channel is unavailable.');
      }
    } catch (error) {
      console.error('Error saving/logging departed team member:', error);
    }
  },
};
