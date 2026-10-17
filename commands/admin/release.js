
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { RELEASE_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

const Staffs = require('../../models/staffs');
const Teams = require('../../models/teams');

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);

  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('release')
    .setDescription('Release a player from your team')
    .addUserOption(opt =>
      opt
        .setName('player')
        .setDescription('Player to release')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const allowedRoles = Array.isArray(RELEASE_ROLE)
      ? RELEASE_ROLE
      : [RELEASE_ROLE];

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

    const staffEntry = await Staffs.findOne({
      userId: interaction.user.id,
    });

    if (!staffEntry) {
      return interaction.reply({
        content: 'You are not on any team.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const team = await Teams.findOne({
      roleId: staffEntry.teamRoleId,
    });

    if (!team) {
      return interaction.reply({
        content: 'Your team could not be found.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const player = interaction.options.getUser('player');

    let member;

    try {
      member = await interaction.guild.members.fetch(player.id);
    } catch {
      return interaction.reply({
        content: 'That player could not be found in the server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!member.roles.cache.has(team.roleId)) {
      return interaction.reply({
        content: `<@${player.id}> is not on **${team.name}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetStaffEntry = await Staffs.findOne({
      userId: player.id,
      teamRoleId: team.roleId,
    });

    if (targetStaffEntry) {
      return interaction.reply({
        content:
          `Demote <@${player.id}> from their **${targetStaffEntry.position}** position before releasing them.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await member.roles.remove(
        team.roleId,
        `Released from ${team.name} by ${interaction.user.tag}`
      );
    } catch (error) {
      console.error('Failed to remove team role:', error);

      return interaction.reply({
        content:
          'Could not remove the team role. Check the bot permissions and role hierarchy.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const guild = interaction.guild;

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setAuthor({
        name: guild.name,
        iconURL: guild.iconURL({ size: 256 }) || undefined,
      })
      .setTitle('Player Released')
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
          name: 'Released Player',
          value: `<@${player.id}>`,
          inline: false,
        },
        {
          name: 'Released By',
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
      content: `<@${player.id}> has been released from **${team.name}**.`,
      allowedMentions: { parse: [] },
    });
  },
};
