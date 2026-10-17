
const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const getGuildMembers = require('../../utils/getGuildMembers');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);

  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('teaminfo')
    .setDescription('View detailed information about any team'),

  async execute(interaction, client) {
    const teams = await Teams.find().sort({ name: 1 });

    if (!teams.length) {
      return interaction.reply({
        content: 'There are no teams yet.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (teams.length > 25) {
      return interaction.reply({
        content: 'There are too many teams to display in one menu.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId('teaminfo-select')
      .setPlaceholder('Select a team...')
      .addOptions(
        teams.map(team => {
          const option = {
            label: team.name.slice(0, 100),
            value: team.roleId,
          };

          if (team.emoji) {
            option.emoji = team.emoji;
          }

          return option;
        })
      );

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
      content: 'Choose a team to view its information:',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleSelect(interaction, client) {
    await interaction.deferUpdate();

    try {
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

        playerList = playerList.slice(0, 1024 - suffix.length) + suffix;
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

      await interaction.editReply({
        content: '',
        embeds: [embed],
        components: [],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('Error handling teaminfo select:', error);

      await interaction.editReply({
        content: 'An error occurred while loading team information. Please try again later.',
        components: [],
        embeds: [],
      }).catch(() => {});
    }
  },
};
