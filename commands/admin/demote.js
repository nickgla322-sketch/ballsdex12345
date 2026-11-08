
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const {
  DEMOTE_ROLE,
  ASSISTANT_MANAGER_ROLE,
  MANAGER_ROLE,
  CHAIRMAN_ROLE,
} = require('../../utils/permissions');

const { logAction } = require('../../utils/logger');
const Staffs = require('../../models/staffs');
const Teams = require('../../models/teams');

const HIERARCHY = ['assistant', 'manager', 'chairman'];

function getStaffRoleId(position) {
  switch (position) {
    case 'assistant':
      return ASSISTANT_MANAGER_ROLE;
    case 'manager':
      return MANAGER_ROLE;
    case 'chairman':
      return CHAIRMAN_ROLE;
    default:
      return null;
  }
}

function pretty(position) {
  switch (position) {
    case 'assistant':
      return 'Assistant Manager';
    case 'manager':
      return 'Manager';
    case 'chairman':
      return 'Chairman';
    case 'none':
      return 'Team Player';
    default:
      return 'Unknown';
  }
}

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);

  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Demote a person to a lower position')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('User to demote')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('to')
        .setDescription('Position to demote to')
        .setRequired(true)
        .addChoices(
          { name: 'Manager', value: 'manager' },
          { name: 'Assistant Manager', value: 'assistant' },
          { name: 'Normal Team Member', value: 'none' }
        )
    ),

  async execute(interaction, client) {
    try {
      // Permission check
      const allowedRoles = Array.isArray(DEMOTE_ROLE)
        ? DEMOTE_ROLE
        : [DEMOTE_ROLE];

      if (
        !allowedRoles.some(
          roleId =>
            roleId && interaction.member.roles.cache.has(roleId)
        )
      ) {
        return interaction.reply({
          content: 'You do not have permission to use this command.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const targetUser = interaction.options.getUser('user');
      const toPosition = interaction.options.getString('to');

      // Load the executor's staff record
      const executorEntry = await Staffs.findOne({
        userId: interaction.user.id,
      });

      if (!executorEntry) {
        return interaction.reply({
          content: 'You do not have permission to use this command.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Load team information
      const team = await Teams.findOne({
        roleId: executorEntry.teamRoleId,
      });

      if (!team) {
        return interaction.reply({
          content: 'Your team could not be found in the database.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const executorRank = HIERARCHY.indexOf(executorEntry.position);
      const toRank = HIERARCHY.indexOf(toPosition);

      const guildMember = await interaction.guild.members
        .fetch(targetUser.id)
        .catch(() => null);

      // The staff database is also used to verify team membership when the
      // target has left the server.
      const targetEntry = await Staffs.findOne({
        userId: targetUser.id,
        teamRoleId: executorEntry.teamRoleId,
      });

      if (
        guildMember &&
        !guildMember.roles.cache.has(executorEntry.teamRoleId)
      ) {
        return interaction.reply({
          content: `<@${targetUser.id}> is not on your team.`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      }

      // Target must already be staff on this team
      if (!targetEntry) {
        return interaction.reply({
          content:
            `<@${targetUser.id}> is not in a management position on your team.`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      }

      const targetRank = HIERARCHY.indexOf(targetEntry.position);

      if (executorRank === -1 || targetRank === -1) {
        return interaction.reply({
          content: 'A staff position in the database is invalid.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Executor must outrank the target
      if (executorRank <= targetRank) {
        return interaction.reply({
          content: 'You cannot demote someone equal to or above your rank.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Prevent selecting a position equal to or higher than the target's
      if (toPosition !== 'none' && toRank >= targetRank) {
        return interaction.reply({
          content:
            `You can only demote <@${targetUser.id}> to a lower position.`,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      }

      // Prevent duplicate staff positions
      if (toPosition !== 'none') {
        const conflicting = await Staffs.findOne({
          teamRoleId: executorEntry.teamRoleId,
          position: toPosition,
          userId: { $ne: targetUser.id },
        });

        if (conflicting) {
          return interaction.reply({
            content:
              `There is already a **${pretty(toPosition)}** on this team. ` +
              'Remove them first.',
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      const oldPosition = targetEntry.position;
      const oldRoleId = getStaffRoleId(oldPosition);
      const newRoleId = getStaffRoleId(toPosition);
      const guild = interaction.guild;

      // Update Discord roles when the target is present. If they are away,
      // update the database and saved rejoin record instead.
      if (guildMember && oldRoleId && guildMember.roles.cache.has(oldRoleId)) {
        await guildMember.roles.remove(oldRoleId);
      }

      // Demote to a normal team member
      if (toPosition === 'none') {
        await Staffs.deleteOne({
          _id: targetEntry._id,
        });
      } else {
        // Apply the new staff role when the target is present.
        if (!newRoleId) {
          return interaction.reply({
            content: 'The selected staff role is not configured correctly.',
            flags: MessageFlags.Ephemeral,
          });
        }

        if (guildMember) {
          await guildMember.roles.add(newRoleId);
        }

        // Update staff record
        targetEntry.position = toPosition;
        await targetEntry.save();
      }

      // Keep the saved roles in sync for members who are currently away.
      if (!guildMember) {
        const DepartedMembers = require('../../models/departedMembers');
        await DepartedMembers.updateOne(
          {
            guildId: interaction.guild.id,
            userId: targetUser.id,
          },
          {
            $set: {
              'memberships.$[membership].staffRoleId':
                toPosition === 'none' ? null : newRoleId,
              'memberships.$[membership].position':
                toPosition === 'none' ? null : toPosition,
            },
          },
          {
            arrayFilters: [
              { 'membership.teamRoleId': executorEntry.teamRoleId },
            ],
          }
        );
      }

      // Build demotion log
      const embed = new EmbedBuilder()
        .setColor(toPosition === 'none' ? '#e74c3c' : '#e67e22')
        .setAuthor({
          name: guild.name,
          iconURL: guild.iconURL({ size: 256 }) || undefined,
        })
        .setTitle('Team Demotion')
        .addFields(
          {
            name: 'Division',
            value: team.division || 'Unknown',
            inline: false,
          },
          {
            name: 'Team',
            value: `${team.emoji || ''} <@&${team.roleId}>`,
            inline: false,
          },
          {
            name: 'Old Position',
            value: oldRoleId
              ? `<@&${oldRoleId}>`
              : pretty(oldPosition),
            inline: true,
          },
          {
            name: 'New Position',
            value: newRoleId
              ? `<@&${newRoleId}>`
              : 'Team Player',
            inline: true,
          },
          {
            name: 'Demoted User',
            value: `<@${targetUser.id}>`,
            inline: false,
          },
          {
            name: 'Demoted By',
            value: `<@${interaction.user.id}>`,
            inline: false,
          }
        )
        .setTimestamp();

      const teamLogoUrl = getTeamLogoUrl(team.emoji);

      if (teamLogoUrl) {
        embed.setThumbnail(teamLogoUrl);
      }

      await logAction(client, {
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      // Confirmation
      const confirmation =
        toPosition === 'none'
          ? `<@${targetUser.id}> is now a **Team Player** of ${team.emoji || ''} **${team.name}**.`
          : `<@${targetUser.id}> has been demoted to **${pretty(toPosition)}** in ${team.emoji || ''} **${team.name}**.`;

      return interaction.reply({
        content: confirmation,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('Error in /demote:', error);

      const errorMessage = {
        content: 'An error occurred while demoting this user. Check the bot console for details.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage).catch(() => {});
      } else {
        await interaction.reply(errorMessage).catch(() => {});
      }
    }
  },
};
