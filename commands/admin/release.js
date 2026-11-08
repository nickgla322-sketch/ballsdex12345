
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { RELEASE_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

const Staffs = require('../../models/staffs');
const Teams = require('../../models/teams');

const FREE_AGENT_ROLE_ID = '1374495332846669956';

const RELEASE_LIMIT = 5;
const RELEASE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RELEASE_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

// Tracks successful releases by each person using the command.
const releaseHistory = new Map();
const releaseCooldowns = new Map();

// Prevents someone from processing multiple releases simultaneously.
const activeReleases = new Set();

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);

  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=26&quality=lossless`;
}

function getCurrentCooldown(userId) {
  const expiry = releaseCooldowns.get(userId);

  if (!expiry) return null;

  if (Date.now() >= expiry) {
    releaseCooldowns.delete(userId);
    return null;
  }

  return expiry;
}

function getCooldownMessage(expiry) {
  const remaining = Math.max(0, expiry - Date.now());
  const totalMinutes = Math.ceil(remaining / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    `You have reached the release limit. You must wait **${hours}h ${minutes}m** ` +
    'before releasing another player.'
  );
}

function getRecentReleases(userId) {
  const cutoff = Date.now() - RELEASE_WINDOW_MS;

  const recent = (releaseHistory.get(userId) || []).filter(
    release => release.timestamp > cutoff
  );

  releaseHistory.set(userId, recent);

  return recent;
}

function recordRelease(actorId, targetUserId) {
  const recent = getRecentReleases(actorId);

  // Count each player only once within the five-minute window.
  if (!recent.some(release => release.targetUserId === targetUserId)) {
    recent.push({
      targetUserId,
      timestamp: Date.now(),
    });
  }

  releaseHistory.set(actorId, recent);

  if (recent.length >= RELEASE_LIMIT) {
    const expiry = Date.now() + RELEASE_COOLDOWN_MS;

    releaseCooldowns.set(actorId, expiry);
    releaseHistory.delete(actorId);

    return expiry;
  }

  return null;
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
    const allowedRoles = (
      Array.isArray(RELEASE_ROLE) ? RELEASE_ROLE : [RELEASE_ROLE]
    ).filter(Boolean);

    if (
      !allowedRoles.some(roleId =>
        interaction.member.roles.cache.has(roleId)
      )
    ) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const actorId = interaction.user.id;

    // Check the user's personal release cooldown.
    const cooldownExpiry = getCurrentCooldown(actorId);

    if (cooldownExpiry) {
      return interaction.reply({
        content: getCooldownMessage(cooldownExpiry),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (activeReleases.has(actorId)) {
      return interaction.reply({
        content: 'You already have a release operation in progress.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const staffEntry = await Staffs.findOne({
      userId: actorId,
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

    if (player.id === actorId) {
      return interaction.reply({
        content: 'You cannot release yourself.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const member = await interaction.guild.members
      .fetch(player.id)
      .catch(() => null);

    const departedRecord = member ? null : await require('../../models/departedMembers').findOne({
      guildId: interaction.guild.id,
      userId: player.id,
    });

    const savedTeamMembership = departedRecord?.memberships?.some(
      membership => membership.teamRoleId === team.roleId
    );

    if (
      (member && !member.roles.cache.has(team.roleId)) ||
      (!member && !savedTeamMembership)
    ) {
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
          `Demote <@${player.id}> from their **${targetStaffEntry.position}** ` +
          'position before releasing them.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Recheck immediately before changing roles.
    const latestCooldown = getCurrentCooldown(actorId);

    if (latestCooldown) {
      return interaction.reply({
        content: getCooldownMessage(latestCooldown),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (activeReleases.has(actorId)) {
      return interaction.reply({
        content: 'You already have a release operation in progress.',
        flags: MessageFlags.Ephemeral,
      });
    }

    activeReleases.add(actorId);

    try {
      if (member) {
        // Remove the team role.
        await member.roles.remove(
          team.roleId,
          `Released from ${team.name} by ${interaction.user.tag}`
        );

        // Give the Free Agent role if they don't already have it.
        if (!member.roles.cache.has(FREE_AGENT_ROLE_ID)) {
          await member.roles.add(
            FREE_AGENT_ROLE_ID,
            `Released from ${team.name}: returning to Free Agent status`
          );
        }
      } else {
        // The player is away: remove the saved team membership and mark
        // Free Agent for the rejoin handler to apply.
        await require('../../models/departedMembers').updateOne(
          { guildId: interaction.guild.id, userId: player.id },
          {
            $pull: { memberships: { teamRoleId: team.roleId } },
            $set: { freeAgent: true },
          }
        );
      }
    } catch (error) {
      console.error('Failed to update player roles:', error);

      return interaction.reply({
        content:
          'Could not update the player roles. Check the bot permissions ' +
          'and role hierarchy. If the team role was already removed, ' +
          'check the player roles before trying again.',
        flags: MessageFlags.Ephemeral,
      });
    } finally {
      activeReleases.delete(actorId);
    }

    // Count the release only after the role updates succeed.
    const newCooldownExpiry = recordRelease(actorId, player.id);

    await require('../../utils/getGuildMembers')(interaction.guild);
    const updatedTeamRole = interaction.guild.roles.cache.get(team.roleId);
    const rosterCount = updatedTeamRole ? updatedTeamRole.members.size : 0;

    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setAuthor({
        name: interaction.guild.name,
        iconURL: interaction.guild.iconURL({ size: 256 }) || undefined,
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
          value: `<@${actorId}>`,
          inline: false,
        },
        {
          name: 'New Status',
          value: 'Free Agent',
          inline: false,
        }
      )
      .setTimestamp();

    const teamThumbnail = getTeamLogoUrl(team.emoji);

    if (teamThumbnail) {
      embed.setThumbnail(teamThumbnail);
    }

    try {
      await logAction(client, {
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('Failed to log player release:', error);
    }

    let response =
      `<@${player.id}> has been released from **${team.name}** ` +
      'and given the Free Agent role.' +
      `\n**Roster:** ${rosterCount}/16`;

    if (newCooldownExpiry) {
      response +=
        '\n\nYou have reached the release limit and are now on a ' +
        '**6-hour release cooldown**.';
    }

    return interaction.reply({
      content: response,
      allowedMentions: { parse: [] },
    });
  },
};
