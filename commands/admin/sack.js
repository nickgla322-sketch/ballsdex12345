
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags
} = require('discord.js');

const {
  SACK_ROLE,
  ASSISTANT_MANAGER_ROLE,
  MANAGER_ROLE,
  CHAIRMAN_ROLE
} = require('../../utils/permissions');

const { logAction } = require('../../utils/logger');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');

// Position -> Discord role ID
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

// Display names
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
    // Permission check
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
        flags: MessageFlags.Ephemeral
      });
    }

    const user = interaction.options.getUser('user');

    // Automatically find every staff position belonging to this user
    const staffEntries = await Staffs.find({
      userId: user.id
    });

    if (staffEntries.length === 0) {
      return interaction.reply({
        content: `<@${user.id}> is not currently registered as staff.`,
        flags: MessageFlags.Ephemeral
      });
    }

    // One staff position = automatically identify their team
    if (staffEntries.length === 1) {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral
      });

      return sackStaff(
        interaction,
        client,
        user,
        staffEntries[0]
      );
    }

    // Multiple staff positions = let the command user choose
    // which specific position to remove.
    const teams = await Teams.find({
      roleId: {
        $in: staffEntries.map(entry => entry.teamRoleId)
      }
    });

    const teamMap = new Map(
      teams.map(team => [team.roleId, team])
    );

    const options = staffEntries.map((entry, index) => {
      const team = teamMap.get(entry.teamRoleId);

      return new StringSelectMenuOptionBuilder()
        .setLabel(
          `${team?.name || 'Unknown Team'} - ${pretty(entry.position)}`
            .slice(0, 100)
        )
        .setValue(String(entry._id))
        .setDescription(
          `Remove ${pretty(entry.position)} from ${team?.name || 'Unknown Team'}`
            .slice(0, 100)
        )
        .setEmoji(team?.emoji || undefined);
    });

    // Discord select menus allow a maximum of 25 options
    if (options.length > 25) {
      return interaction.reply({
        content:
          'This user has more than 25 staff positions. ' +
          'Please review their staff records before proceeding.',
        flags: MessageFlags.Ephemeral
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`sack-position-${interaction.id}`)
      .setPlaceholder('Select the position to remove...')
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
      content:
        `<@${user.id}> has multiple staff positions. ` +
        'Which position do you want to remove?',
      components: [row],
      flags: MessageFlags.Ephemeral
    });

    const reply = await interaction.fetchReply();

    const collector = reply.createMessageComponentCollector({
      filter: i =>
        i.customId === `sack-position-${interaction.id}` &&
        i.user.id === interaction.user.id,
      time: 30000,
      max: 1
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
            components: []
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
          components: []
        }).catch(() => {});
      }
    });

    collector.on('end', async collected => {
      if (collected.size === 0) {
        await interaction.editReply({
          content: 'No position selected. Command cancelled.',
          components: []
        }).catch(() => {});
      }
    });
  }
};

// Perform the actual sack operation
async function sackStaff(interaction, client, user, staffEntry) {
  const team = await Teams.findOne({
    roleId: staffEntry.teamRoleId
  });

  if (!team) {
    return interaction.editReply({
      content: 'The team associated with this staff position no longer exists.',
      components: []
    });
  }

  const removed = staffEntry;
  const staffRoleId = getStaffRoleId(removed.position);

  // Make sure the target is in the server before modifying the database
  let member;

  try {
    member = await interaction.guild.members.fetch(user.id);
  } catch {
    return interaction.editReply({
      content: 'This user could not be found in the server. No changes were made.',
      components: []
    });
  }

  // Remove the team role
  if (member.roles.cache.has(team.roleId)) {
    await member.roles.remove(team.roleId);
  }

  // Remove this staff position from MongoDB
  await Staffs.deleteOne({
    _id: removed._id
  });

  // Keep the hierarchy role if the user still holds the same
  // position in another team.
  const remainingPosition = await Staffs.exists({
    userId: user.id,
    position: removed.position
  });

  if (
    staffRoleId &&
    !remainingPosition &&
    member.roles.cache.has(staffRoleId)
  ) {
    await member.roles.remove(staffRoleId);
  }

  // Logging embed
  const guild = interaction.guild;

  const embed = new EmbedBuilder()
    .setColor('#e74c3c')
    .setAuthor({
      name: guild.name,
      iconURL: guild.iconURL({ size: 256 }) || undefined
    })
    .setTitle('Staff Member Sacked')
    .setThumbnail(
      team.emoji && team.emoji.startsWith('<')
        ? `https://cdn.discordapp.com/emojis/${team.emoji.replace(/\D/g, '')}.png?size=256&quality=lossless`
        : guild.iconURL({ size: 256 }) || null
    )
    .addFields(
      {
        name: 'Team',
        value: `${team.emoji || ''} <@&${team.roleId}>`,
        inline: false
      },
      {
        name: 'Position Removed',
        value: staffRoleId
          ? `<@&${staffRoleId}> (${pretty(removed.position)})`
          : pretty(removed.position),
        inline: true
      },
      {
        name: 'User Sacked',
        value: `<@${user.id}>`,
        inline: false
      },
      {
        name: 'Sacked By',
        value: `<@${interaction.user.id}>`,
        inline: false
      }
    )
    .setTimestamp();

  await logAction(client, {
    embeds: [embed]
  });

  return interaction.editReply({
    content:
      `<@${user.id}> has been sacked from **${team.name}** ` +
      `(was **${pretty(removed.position)}**).`,
    components: []
  });
}
