
const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const getGuildMembers = require('../../utils/getGuildMembers');

const Divisions = require('../../models/divisions');
const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);

  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

function createDivisionMenu(divisions, customId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select a division...')
    .addOptions(
      divisions.map(division => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(division.name.slice(0, 100))
          .setValue(division.name);

        if (division.emoji) {
          option.setEmoji(division.emoji);
        }

        return option;
      })
    );

  return new ActionRowBuilder().addComponents(menu);
}

function createTeamMenu(teams, customId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Select a team...')
    .addOptions(
      teams.map(team => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(team.name.slice(0, 100))
          .setValue(team.roleId);

        if (team.emoji) {
          option.setEmoji(team.emoji);
        }

        return option;
      })
    );

  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('teaminfo')
    .setDescription('View detailed information about any team'),

  async execute(interaction, client) {
    const divisions = await Divisions.find().sort({ name: 1 });

    if (divisions.length === 0) {
      return interaction.reply({
        content: 'There are no divisions yet.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (divisions.length > 25) {
      return interaction.reply({
        content: 'There are too many divisions to display in one menu.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const row = createDivisionMenu(
      divisions,
      `teaminfo-division-${interaction.id}`
    );

    await interaction.reply({
      content: 'Select a division to view its teams:',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleSelect(interaction, client) {
    try {
      await interaction.deferUpdate();

      const customId = interaction.customId;

      // Step 1: A division was selected.
      if (customId.startsWith('teaminfo-division-')) {
        const divisionName = interaction.values[0];

        const division = await Divisions.findOne({
          name: divisionName,
        });

        if (!division) {
          return interaction.editReply({
            content: 'This division no longer exists.',
            components: [],
            embeds: [],
          });
        }

        const teams = await Teams.find({
          division: division.name,
        }).sort({ name: 1 });

        if (teams.length === 0) {
          return interaction.editReply({
            content: `**${division.emoji || ''} ${division.name}** has no teams yet.`,
            components: [],
            embeds: [],
          });
        }

        if (teams.length > 25) {
          return interaction.editReply({
            content: `There are too many teams in **${division.name}** to display in one menu.`,
            components: [],
            embeds: [],
          });
        }

        const row = createTeamMenu(
          teams,
          `teaminfo-team-${interaction.id}`
        );

        return interaction.editReply({
          content: `**${division.emoji || ''} ${division.name}**\nSelect a team to view its information:`,
          components: [row],
          embeds: [],
        });
      }

      // Step 2: A team was selected.
      if (customId.startsWith('teaminfo-team-')) {
        const teamRoleId = interaction.values[0];

        const team = await Teams.findOne({
          roleId: teamRoleId,
        });

        if (!team) {
          return interaction.editReply({
            content: 'This team no longer exists.',
            components: [],
            embeds: [],
          });
        }

        const staff = await Staffs.find({
          teamRoleId,
        });

        const chairman = staff.find(s => s.position === 'chairman');
        const manager = staff.find(s => s.position === 'manager');
        const assistant = staff.find(s => s.position === 'assistant');

        const chairmanText = chairman
          ? `<@${chairman.userId}>`
          : 'Vacant';

        const managerText = manager
          ? `<@${manager.userId}>`
          : 'Vacant';

        const assistantText = assistant
          ? `<@${assistant.userId}>`
          : 'Vacant';

        await getGuildMembers(interaction.guild);

        const role = interaction.guild.roles.cache.get(teamRoleId);
        const membersWithRole = role ? role.members : new Map();

        const playerLines = [];

        for (const [id] of membersWithRole) {
          let label = '(Player)';

          if (chairman && chairman.userId === id) {
            label = '(Chairman)';
          } else if (manager && manager.userId === id) {
            label = '(Manager)';
          } else if (assistant && assistant.userId === id) {
            label = '(Assistant Manager)';
          }

          playerLines.push(`• <@${id}> ${label}`);
        }

        if (playerLines.length === 0) {
          playerLines.push('*No players signed yet.*');
        }

        let playerList = '';
        let omitted = 0;

        for (const line of playerLines) {
          const next = playerList
            ? `${playerList}\n${line}`
            : line;

          if (next.length > 900) {
            omitted++;
            continue;
          }

          playerList = next;
        }

        if (omitted > 0) {
          const suffix = `\n...and ${omitted} more member(s).`;

          playerList =
            playerList.slice(0, 1024 - suffix.length) + suffix;
        }

        const guildIcon = interaction.guild.iconURL({
          size: 256,
        });

        const embed = new EmbedBuilder()
          .setColor('#3498db')
          .setAuthor({
            name: interaction.guild.name,
            iconURL: guildIcon || undefined,
          })
          .setTitle(`${team.emoji || ''} ${team.name} Team Information`)
          .addFields(
            {
              name: 'Division',
              value: team.division || 'Unknown',
              inline: false,
            },
            {
              name: 'Chairman',
              value: chairmanText,
              inline: true,
            },
            {
              name: 'Manager',
              value: managerText,
              inline: true,
            },
            {
              name: 'Assistant Manager',
              value: assistantText,
              inline: true,
            },
            {
              name: `Players (${membersWithRole.size})`,
              value: playerList || '*No players signed yet.*',
              inline: false,
            }
          )
          .setTimestamp();

        const teamLogoUrl = getTeamLogoUrl(team.emoji);

        if (teamLogoUrl) {
          embed.setThumbnail(teamLogoUrl);
        } else if (guildIcon) {
          embed.setThumbnail(guildIcon);
        }

        return interaction.editReply({
          content: '',
          embeds: [embed],
          components: [],
          allowedMentions: { parse: [] },
        });
      }
    } catch (error) {
      console.error('Error handling teaminfo selection:', error);

      const errorMessage = {
        content: 'An error occurred while loading the information. Please try again later.',
        components: [],
        embeds: [],
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorMessage).catch(() => {});
      } else {
        await interaction.reply({
          ...errorMessage,
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  },
};
