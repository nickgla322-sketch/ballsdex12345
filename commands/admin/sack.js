
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');

const {
  SACK_ROLE,
  ASSISTANT_MANAGER_ROLE,
  MANAGER_ROLE,
  CHAIRMAN_ROLE,
} = require('../../utils/permissions');

const { logAction } = require('../../utils/logger');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');

const SACK_LIMIT = 3;
const SACK_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const SACK_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

// Tracks successful sacks by the person using the command.
const sackHistory = new Map();
const sackCooldowns = new Map();

// Prevents the same person from processing multiple sacks at once.
const activeSacks = new Set();

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

function getCooldownMessage(expiry) {
  const remaining = Math.max(0, expiry - Date.now());
  const totalMinutes = Math.ceil(remaining / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    `You have reached the sack limit. You must wait **${hours}h ${minutes}m** ` +
    'before sacking another person.'
  );
}

function getActiveSacks(userId) {
  const cutoff = Date.now() - SACK_WINDOW_MS;

  const recent = (sackHistory.get(userId) || []).filter(
    sack => sack.timestamp > cutoff
  );

  sackHistory.set(userId, recent);

  return recent;
}

function recordSack(actorId, targetUserId) {
  const recent = getActiveSacks(actorId);

  // Count each target only once within the five-minute window.
  // Removing multiple positions from the same person counts as one person.
  if (!recent.some(sack => sack.targetUserId === targetUserId)) {
    recent.push({
      targetUserId,
      timestamp: Date.now(),
    });
  }

  sackHistory.set(actorId, recent);

  if (recent.length >= SACK_LIMIT) {
    const expiry = Date.now() + SACK_COOLDOWN_MS;

    sackCooldowns.set(actorId, expiry);
    sackHistory.delete(actorId);

    return expiry;
  }

  return null;
}

function getCurrentCooldown(userId) {
  const expiry = sackCooldowns.get(userId);

  if (!expiry) return null;

  if (Date.now() >= expiry) {
    sackCooldowns.delete(userId);
    return null;
  }

  return expiry;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sack')
    .setDescription('Remove a staff member from their management position')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('Staff member to sack')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const allowedRoles = (
      Array.isArray(SACK_ROLE) ? SACK_ROLE : [SACK_ROLE]
    ).filter(Boolean);

    if (
      allowedRoles.length > 0 &&
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
    const cooldownExpiry = getCurrentCooldown(actorId);

    if (cooldownExpiry) {
      return interaction.reply({
        content: getCooldownMessage(cooldownExpiry),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (activeSacks.has(actorId)) {
      return interaction.reply({
        content: 'You already have a sack operation in progress.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const user = interaction.options.getUser('user');

    if (user.id === actorId) {
      return interaction.reply({
        content: 'You cannot sack yourself.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const staffEntries = await Staffs.find({
      userId: user.id,
    });

    if (staffEntries.length === 0) {
      return interaction.reply({
        content: `<@${user.id}> is not currently registered as staff.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (staffEntries.length === 1) {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      return sackStaff(
        interaction,
        client,
        user,
        staffEntries[0]
      );
    }

    const teams = await Teams.find({
      roleId: {
        $in: staffEntries.map(entry => entry.teamRoleId),
      },
    });

    const teamMap = new Map(
      teams.map(team => [team.roleId, team])
    );

    const options = staffEntries.map(entry => {
      const team = teamMap.get(entry.teamRoleId);

      const option = new StringSelectMenuOptionBuilder()
        .setLabel(
          `${team?.name || 'Unknown Team'} - ${pretty(entry.position)}`
            .slice(0, 100)
        )
        .setValue(String(entry._id))
        .setDescription(
          `Remove ${pretty(entry.position)} from ${team?.name || 'Unknown Team'}`
            .slice(0, 100)
        );

      return option;
    });

    if (options.length > 25) {
      return interaction.reply({
        content:
          'This user has more than 25 staff positions. ' +
          'Please review their staff records before proceeding.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`sack-position-${interaction.id}`)
      .setPlaceholder('Select the position to remove')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
      content:
        `<@${user.id}> has multiple staff positions. ` +
        'Which position do you want to remove?',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i =>
        i.customId === `sack-position-${interaction.id}` &&
        i.user.id === actorId,
      time: 30_000,
      max: 1,
    });

    collector.on('collect', async i => {
      try {
        await i.deferUpdate();

        const staffEntry = staffEntries.find(
          entry => String(entry._id) === i.values[0]
        );

        if (!staffEntry) {
          return interaction.editReply({
            content: 'Staff position not found.',
            components: [],
          });
        }

        await sackStaff(
          interaction,
          client,
          user,
          staffEntry
        );
      } catch (error) {
        console.error('Error handling sack selection:', error);

        await interaction.editReply({
          content: 'An error occurred while sacking this staff member.',
          components: [],
        }).catch(() => {});
      }
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        await interaction.editReply({
          content: 'No position selected. Command cancelled.',
          components: [],
        }).catch(() => {});
      }
    });
  },
};

async function sackStaff(interaction, client, user, staffEntry) {
  const actorId = interaction.user.id;

  // Check again when the position is actually being processed.
  const cooldownExpiry = getCurrentCooldown(actorId);

  if (cooldownExpiry) {
    return interaction.editReply({
      content: getCooldownMessage(cooldownExpiry),
      components: [],
    });
  }

  if (activeSacks.has(actorId)) {
    return interaction.editReply({
      content: 'You already have a sack operation in progress.',
      components: [],
    });
  }

  activeSacks.add(actorId);

  try {
    const team = await Teams.findOne({
      roleId: staffEntry.teamRoleId,
    });

    if (!team) {
      return interaction.editReply({
        content:
          'The team associated with this staff position no longer exists.',
        components: [],
      });
    }

    const staffRoleId = getStaffRoleId(staffEntry.position);

    let member;

    try {
      member = await interaction.guild.members.fetch(user.id);
    } catch {
      return interaction.editReply({
        content:
          'This user could not be found in the server. No changes were made.',
        components: [],
      });
    }

    const staffRoleIds = (
      Array.isArray(staffRoleId) ? staffRoleId : [staffRoleId]
    ).filter(Boolean);

    // Check for another position before changing anything.
    const remainingPosition = await Staffs.exists({
      userId: user.id,
      position: staffEntry.position,
      _id: { $ne: staffEntry._id },
    });

    // Remove the hierarchy role first. If Discord rejects this operation,
    // retain the database record so the position can be retried safely.
    if (!remainingPosition) {
      for (const roleId of staffRoleIds) {
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(
            roleId,
            `Sacked from ${pretty(staffEntry.position)} at ${team.name}`
          );
        }
      }
    }

    const deleteResult = await Staffs.deleteOne({ _id: staffEntry._id });
    if (!deleteResult.deletedCount) {
      return interaction.editReply({
        content: 'This staff position changed during processing. Please check the staff records.',
        components: [],
      });
    }

    // Record the sack after the staff record has been removed.
    // The third distinct person sacked within five minutes triggers the cooldown.
    const newCooldownExpiry = recordSack(actorId, user.id);

    const guild = interaction.guild;

    const embed = new EmbedBuilder()
      .setColor('#e74c3c')
      .setAuthor({
        name: guild.name,
        iconURL: guild.iconURL({ size: 256 }) || undefined,
      })
      .setTitle('Staff Member Sacked')
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
          name: 'Position Removed',
          value: staffRoleIds.length
            ? `${staffRoleIds.map(id => `<@&${id}>`).join(', ')} (${pretty(staffEntry.position)})`
            : pretty(staffEntry.position),
          inline: true,
        },
        {
          name: 'User Sacked',
          value: `<@${user.id}>`,
          inline: false,
        },
        {
          name: 'Sacked By',
          value: `<@${actorId}>`,
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

    const recentSackCount = getActiveSacks(actorId).length;

    let response =
      `<@${user.id}> has been removed from the **${pretty(staffEntry.position)}** ` +
      `position at **${team.name}**. They remain on the team.`;

    if (newCooldownExpiry) {
      response +=
        '\n\nYou have sacked **3 different people within 5 minutes**. ' +
        'You are now on a **6-hour sack cooldown**.';
    } else {
      response +=
        `\n\nSacks in the last 5 minutes: **${recentSackCount}/${SACK_LIMIT}**.`;
    }

    return interaction.editReply({
      content: response,
      allowedMentions: { parse: [] },
      components: [],
    });
  } catch (error) {
    console.error('Error sacking staff member:', error);

    return interaction.editReply({
      content:
        'An error occurred while sacking this staff member. ' +
        'Check the bot console for details.',
      components: [],
    }).catch(() => {});
  } finally {
    activeSacks.delete(actorId);
  }
}
