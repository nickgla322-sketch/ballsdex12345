
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const {
  PROMOTE_ROLE,
  ASSISTANT_MANAGER_ROLE,
  MANAGER_ROLE,
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
    default:
      return null;
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
    .setName('promote')
    .setDescription('Promote a team member to a higher management position')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('User to promote')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('to')
        .setDescription('Position to promote to')
        .setRequired(true)
        .addChoices(
          { name: 'Assistant Manager', value: 'assistant' },
          { name: 'Manager', value: 'manager' }
        )
    ),

  async execute(interaction, client) {
    const allowedRoles = Array.isArray(PROMOTE_ROLE)
      ? PROMOTE_ROLE
      : [PROMOTE_ROLE];

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

    const executorEntry = await Staffs.findOne({
      userId: interaction.user.id,
    });

    if (!executorEntry) {
      return interaction.reply({
        content: 'You are not a staff member of any team.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const team = await Teams.findOne({
      roleId: executorEntry.teamRoleId,
    });

    if (!team) {
      return interaction.reply({
        content: 'Your team could not be found.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const executorRank = HIERARCHY.indexOf(executorEntry.position);
    const toRank = HIERARCHY.indexOf(toPosition);

    if (executorRank === -1 || toRank === -1) {
      return interaction.reply({
        content: 'Your staff position or the selected position is invalid.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (executorRank <= toRank) {
      return interaction.reply({
        content: 'You cannot assign a position equal to or above your own.',
        flags: MessageFlags.Ephemeral,
      });
    }

    let guildMember;

    try {
      guildMember = await interaction.guild.members.fetch(targetUser.id);
    } catch {
      return interaction.reply({
        content: 'That user could not be found in the server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!guildMember.roles.cache.has(executorEntry.teamRoleId)) {
      return interaction.reply({
        content: `${targetUser} is not on your team.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    let targetEntry = await Staffs.findOne({
      userId: targetUser.id,
      teamRoleId: executorEntry.teamRoleId,
    });

    const oldPosition = targetEntry?.position;
    const oldRank = HIERARCHY.indexOf(oldPosition);

    if (oldPosition && oldRank === -1) {
      return interaction.reply({
        content: 'The target user has an invalid staff position in the database.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (oldPosition && toRank <= oldRank) {
      return interaction.reply({
        content: `${targetUser} can only be promoted to a higher position.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const conflicting = await Staffs.findOne({
      teamRoleId: executorEntry.teamRoleId,
      position: toPosition,
      userId: { $ne: targetUser.id },
    });

    if (conflicting) {
      return interaction.reply({
        content: `There is already a **${toPosition}** on this team. Demote them first.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const oldRoleId = getStaffRoleId(oldPosition);
    const newRoleId = getStaffRoleId(toPosition);

    if (!newRoleId || Array.isArray(newRoleId)) {
      return interaction.reply({
        content: 'The role for that position is not configured correctly.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const oldRoleIds = Array.isArray(oldRoleId)
      ? oldRoleId
      : oldRoleId
        ? [oldRoleId]
        : [];

    const guild = interaction.guild;

    const hadNewRole = guildMember.roles.cache.has(newRoleId);
    const creatingEntry = !targetEntry;
    const oldPositionBeforeChange = targetEntry?.position;
    try {
      // Add the new role and persist the new position before removing the old role.
      if (!hadNewRole) await guildMember.roles.add(newRoleId, `Promoting to ${toPosition}`);

      if (!targetEntry) {
        targetEntry = new Staffs({
          userId: targetUser.id,
          teamRoleId: executorEntry.teamRoleId,
          teamName: executorEntry.teamName,
          position: toPosition,
        });
      } else {
        targetEntry.position = toPosition;
      }
      await targetEntry.save();

      const stillHasOldPosition = await Staffs.exists({
        userId: targetUser.id,
        position: oldPosition,
        _id: { $ne: targetEntry._id },
      });
      if (!stillHasOldPosition) {
        for (const roleId of oldRoleIds) {
          if (roleId !== newRoleId && guildMember.roles.cache.has(roleId)) {
            await guildMember.roles.remove(roleId, `Promoting to ${toPosition}`);
          }
        }
      }
    } catch (operationError) {
      // Best-effort compensation keeps Discord and MongoDB aligned.
      if (creatingEntry && targetEntry?._id) {
        await Staffs.deleteOne({ _id: targetEntry._id }).catch(() => {});
      } else if (targetEntry && oldPositionBeforeChange) {
        targetEntry.position = oldPositionBeforeChange;
        await targetEntry.save().catch(() => {});
      }
      if (!hadNewRole && guildMember.roles.cache.has(newRoleId)) {
        await guildMember.roles.remove(newRoleId, 'Rolling back failed promotion').catch(() => {});
      }
      for (const roleId of oldRoleIds) {
        if (!guildMember.roles.cache.has(roleId)) {
          await guildMember.roles.add(roleId, 'Restoring previous staff position').catch(() => {});
        }
      }
      throw operationError;
    }

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setAuthor({
        name: guild.name,
        iconURL: guild.iconURL({ size: 256 }) || undefined,
      })
      .setTitle('Team Promotion')
      .addFields(
        {
          name: 'Division',
          value: team.division || 'Unknown',
          inline: false,
        },
        {
          name: 'Team',
          value: `${team.emoji || ''} <@&${executorEntry.teamRoleId}>`,
          inline: false,
        },
        {
          name: 'Old Position',
          value: oldRoleIds.length
            ? oldRoleIds.map(id => `<@&${id}>`).join('\n')
            : '*None*',
          inline: true,
        },
        {
          name: 'New Position',
          value: `<@&${newRoleId}>`,
          inline: true,
        },
        {
          name: 'Promoted User',
          value: `<@${targetUser.id}>`,
          inline: false,
        },
        {
          name: 'Promoted By',
          value: `<@${interaction.user.id}>`,
          inline: false,
        }
      )
      .setTimestamp();

    const teamThumbnail = getTeamLogoUrl(team.emoji);

    if (teamThumbnail) {
      embed.setThumbnail(teamThumbnail);
    }

    await logAction(client, {
      embeds: [embed],
      allowedMentions: { parse: [] },
    });

    await interaction.reply({
      content: `<@${targetUser.id}> has been promoted to <@&${newRoleId}> in **${executorEntry.teamName}**.`,
      allowedMentions: { parse: [] },
    });
  },
};
