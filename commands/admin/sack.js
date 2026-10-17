
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sack')
    .setDescription('Sack a staff member and release them from their team')
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

    const user = interaction.options.getUser('user');

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

      if (team?.emoji) {
        option.setEmoji(team.emoji);
      }

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
        i.user.id === interaction.user.id,
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
  const team = await Teams.findOne({
    roleId: staffEntry.teamRoleId,
  });

  if (!team) {
    return interaction.editReply({
      content: 'The team associated with this staff position no longer exists.',
      components: [],
    });
  }

  const staffRoleId = getStaffRoleId(staffEntry.position);

  let member;

  try {
    member = await interaction.guild.members.fetch(user.id);
  } catch {
    return interaction.editReply({
      content: 'This user could not be found in the server. No changes were made.',
      components: [],
    });
  }

  // Remove the team role.
  if (member.roles.cache.has(team.roleId)) {
    await member.roles.remove(
      team.roleId,
      `Sacked from ${team.name} by ${interaction.user.tag}`
    );
  }

  // Delete this staff position.
  await Staffs.deleteOne({
    _id: staffEntry._id,
  });

  // Keep the hierarchy role if the user still holds this position in another team.
  const remainingPosition = await Staffs.exists({
    userId: user.id,
    position: staffEntry.position,
  });

  const staffRoleIds = Array.isArray(staffRoleId)
    ? staffRoleId
    : staffRoleId
      ? [staffRoleId]
      : [];

  if (!remainingPosition) {
    for (const roleId of staffRoleIds) {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(
          roleId,
          `Removing staff role after sacking from ${team.name}`
        );
      }
    }
  }

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

  return interaction.editReply({
    content:
      `<@${user.id}> has been sacked from **${team.name}** ` +
      `(was **${pretty(staffEntry.position)}**).`,
    allowedMentions: { parse: [] },
    components: [],
  });
}
