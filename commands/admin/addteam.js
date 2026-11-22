
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { ADD_TEAM_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

const Divisions = require('../../models/divisions');
const Teams = require('../../models/teams');

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);
  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addteam')
    .setDescription('Add a team to a division')
    .addRoleOption(opt =>
      opt
        .setName('role')
        .setDescription('Team role')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('emoji')
        .setDescription('Team emoji')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    // Permission check
    const allowedRoles = Array.isArray(ADD_TEAM_ROLE)
      ? ADD_TEAM_ROLE
      : [ADD_TEAM_ROLE];

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

    const role = interaction.options.getRole('role');
    const emoji = interaction.options.getString('emoji');

    // Load divisions
    const divisions = await Divisions.find();

    if (!divisions.length) {
      return interaction.reply({
        content: 'No divisions exist yet.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (divisions.length > 25) {
      return interaction.reply({
        content: 'There are too many divisions to display in one menu. Please reduce the number of divisions.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Build division dropdown
    const menu = new StringSelectMenuBuilder()
      .setCustomId('add-team-division-select')
      .setPlaceholder('Select a division')
      .addOptions(
        divisions.map(division => ({
          label: division.name,
          value: division.name,
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
      content: 'Select the division you want to add this team to:',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    const response = await interaction.fetchReply();

    // Collector
    const collector = response.createMessageComponentCollector({
      filter: i =>
        i.customId === 'add-team-division-select' &&
        i.user.id === interaction.user.id,
      time: 60000,
    });

    collector.on('collect', async i => {
      try {
        const divisionName = i.values[0];

        // Check if the team role is already registered
        const existingTeam = await Teams.findOne({
          roleId: role.id,
        });

        if (existingTeam) {
          collector.stop('already-exists');

          return i.update({
            content: 'This role is already registered as a team.',
            components: [],
          });
        }

        // Confirm the selected division still exists
        const divisionExists = await Divisions.findOne({
          name: divisionName,
        });

        if (!divisionExists) {
          collector.stop('division-missing');

          return i.update({
            content: 'This division no longer exists. Please try again.',
            components: [],
          });
        }

        // Save team to MongoDB
        await Teams.create({
          name: role.name,
          roleId: role.id,
          emoji,
          division: divisionName,
        });

        const guild = interaction.guild;

        // Build log embed
        const embed = new EmbedBuilder()
          .setColor('#2ecc71')
          .setAuthor({
            name: guild.name,
            iconURL: guild.iconURL({ size: 256 }) || undefined,
          })
          .setTitle('Team Added')
          .addFields(
            {
              name: 'Team',
              value: `${emoji} <@&${role.id}>`,
              inline: false,
            },
            {
              name: 'Division',
              value: `**${divisionName}**`,
              inline: false,
            },
            {
              name: 'Added By',
              value: `<@${interaction.user.id}>`,
              inline: false,
            }
          )
          .setTimestamp();

        const teamLogoUrl = getTeamLogoUrl(emoji);

        if (teamLogoUrl) {
          embed.setThumbnail(teamLogoUrl);
        } else if (guild.iconURL()) {
          embed.setThumbnail(guild.iconURL({ size: 256 }));
        }

        // Send log without notifying anyone
        await logAction(client, {
          embeds: [embed],
          allowedMentions: { parse: [] },
        });

        collector.stop('completed');

        // Confirmation
        await i.update({
          content: `Team ${emoji} **${role.name}** has been added to the division **${divisionName}**.`,
          components: [],
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        console.error('Error in /addteam:', error);

        collector.stop('error');

        await i.update({
          content: 'An error occurred while adding the team.',
          components: [],
        }).catch(() => {});
      }
    });

    collector.on('end', (collected, reason) => {
      if (reason !== 'time' || collected.size > 0) return;

      interaction.editReply({
        content: 'No division selected. Command cancelled.',
        components: [],
      }).catch(() => {});
    });
  },
};
