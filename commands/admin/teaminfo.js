
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

function createPlayerList(membersWithRole, staff) {
  const staffByUser = new Map();

  for (const member of staff) {
    if (!staffByUser.has(member.userId)) {
      staffByUser.set(member.userId, []);
    }

    staffByUser.get(member.userId).push(member.position);
  }

  const lines = [];

  for (const [id] of membersWithRole) {
    const positions = staffByUser.get(id) || [];

    let label = '(Player)';

    if (positions.includes('chairman')) {
      label = '(Chairman)';
    } else if (positions.includes('manager')) {
      label = '(Manager)';
    } else if (positions.includes('assistant')) {
      label = '(Assistant Manager)';
    }

    lines.push(`• <@${id}> ${label}`);
  }

  if (lines.length === 0) {
    return '*No players signed yet.*';
  }

  let playerList = '';
  let included = 0;

  for (const line of lines) {
    const suffix = `\n...and ${lines.length - included} more member(s).`;
    const separator = playerList ? '\n' : '';
    const next = playerList + separator + line;

    if (next.length > 1024) {
      break;
    }

    playerList = next;
    included++;
  }

  if (included < lines.length) {
    const suffix = `\n...and ${lines.length - included} more member(s).`;

    while (playerList.length + suffix.length > 1024) {
      const lastNewline = playerList.lastIndexOf('\n');

      if (lastNewline === -1) {
        playerList = playerList.slice(0, 1024 - suffix.length);
        break;
      }

      playerList = playerList.slice(0, lastNewline);
      included--;
    }

    playerList += suffix;
  }

  return playerList;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('teaminfo')
    .setDescription('View detailed information about any team'),

  async execute(interaction, client) {
    try {
      // Acknowledge the command immediately to prevent a timeout.
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const divisions = await Divisions.find().sort({ name: 1 });

      if (divisions.length === 0) {
        return interaction.editReply({
          content: 'There are no divisions yet.',
          components: [],
        });
      }

      if (divisions.length > 25) {
        return interaction.editReply({
          content: 'There are too many divisions to display in one menu.',
          components: [],
        });
      }

      const row = createDivisionMenu(
        divisions,
        `teaminfo-division-${interaction.id}`
      );

      return interaction.editReply({
        content: 'Select a division to view its teams:',
        components: [row],
      });
    } catch (error) {
      console.error('Error executing teaminfo:', error);

      const message =
        'An error occurred while loading divisions. Please try again later.';

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: message,
          components: [],
        }).catch(() => {});
      }

      return interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },

  async handleSelect(interaction, client) {
    try {
      // Acknowledge the dropdown interaction immediately.
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

        const playerList = createPlayerList(membersWithRole, staff);

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
              name: `Players (${membersWithRole.size}/14)`,
              value: playerList,
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
          allowedMentions: {
            parse: [],
          },
        });
      }
    } catch (error) {
      console.error('Error handling teaminfo selection:', error);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: 'An error occurred while loading the information. Please try again later.',
          components: [],
          embeds: [],
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: 'An error occurred while loading the information. Please try again later.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  },
};
