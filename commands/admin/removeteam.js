
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require('discord.js');

const { REMOVE_TEAM_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');
const Divisions = require('../../models/divisions');

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);
  if (!match) return null;

  const isAnimated = emoji.startsWith('<a:');
  const extension = isAnimated ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256`;
}

function limitField(text, maxLength = 1024) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 20) + '\n...and more.';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removeteam')
    .setDescription('Remove a team'),

  async execute(interaction, client) {
    // --- PERMISSION CHECK ---
    const allowedRoles = Array.isArray(REMOVE_TEAM_ROLE)
      ? REMOVE_TEAM_ROLE
      : [REMOVE_TEAM_ROLE];

    if (
      !allowedRoles.some(roleId =>
        interaction.member.roles.cache.has(roleId)
      )
    ) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        ephemeral: true,
      });
    }

    // --- LOAD DIVISIONS ---
    const divisions = await Divisions.find();

    if (!divisions.length) {
      return interaction.reply({
        content: 'There are no divisions to select.',
        ephemeral: true,
      });
    }

    // --- DIVISION DROPDOWN ---
    const divisionMenu = new StringSelectMenuBuilder()
      .setCustomId('remove-team-division-select')
      .setPlaceholder('Select a division')
      .addOptions(
        divisions.slice(0, 25).map(division => ({
          label: division.name,
          value: division.name,
        }))
      );

    const divisionRow = new ActionRowBuilder().addComponents(
      divisionMenu
    );

    await interaction.reply({
      content: 'First, choose the division containing the team:',
      components: [divisionRow],
      ephemeral: true,
    });

    const response = await interaction.fetchReply();

    // --- COLLECTOR ---
    const collector = response.createMessageComponentCollector({
      filter: i =>
        i.user.id === interaction.user.id &&
        [
          'remove-team-division-select',
          'remove-team-team-select',
        ].includes(i.customId),
      time: 60000,
    });

    collector.on('collect', async i => {
      try {
        // --- DIVISION SELECTED ---
        if (i.customId === 'remove-team-division-select') {
          const divisionName = i.values[0];

          const teams = await Teams.find({
            division: divisionName,
          });

          if (!teams.length) {
            return i.update({
              content: `There are no teams in **${divisionName}**.`,
              components: [],
            });
          }

          // --- TEAM DROPDOWN ---
          const teamMenu = new StringSelectMenuBuilder()
            .setCustomId('remove-team-team-select')
            .setPlaceholder('Select a team to remove')
            .addOptions(
              teams.slice(0, 25).map(team => ({
                label: team.name,
                value: team.roleId,
                emoji: team.emoji || undefined,
              }))
            );

          const teamRow = new ActionRowBuilder().addComponents(
            teamMenu
          );

          return i.update({
            content: `Division: **${divisionName}**\nNow choose the team you want to remove:`,
            components: [teamRow],
          });
        }

        // --- TEAM SELECTED ---
        const teamRoleId = i.values[0];

        const team = await Teams.findOne({
          roleId: teamRoleId,
        });

        if (!team) {
          collector.stop('team-missing');

          return i.update({
            content: 'This team no longer exists.',
            components: [],
          });
        }

        const guild = interaction.guild;
        const role = guild.roles.cache.get(team.roleId);

        // --- REMOVE TEAM ROLE FROM PLAYERS ---
        const removedPlayers = [];

        if (role) {
          for (const [, member] of role.members) {
            try {
              await member.roles.remove(team.roleId);
              removedPlayers.push(member);
            } catch (err) {
              console.error(
                `Failed to remove team role from ${member.user.tag}:`,
                err
              );
            }
          }
        }

        // --- REMOVE STAFF RECORDS ---
        const staffEntries = await Staffs.find({
          teamRoleId,
        });

        const removedStaff = staffEntries.length;

        await Staffs.deleteMany({
          teamRoleId,
        });

        // --- REMOVE TEAM FROM DATABASE ---
        await Teams.deleteOne({
          roleId: teamRoleId,
        });

        // --- BUILD PLAYER LIST ---
        const playerList = removedPlayers.length
          ? removedPlayers
              .map(
                member =>
                  `• <@${member.id}> — removed from **${team.name}**`
              )
              .join('\n')
          : '*No players had the role.*';

        // --- BUILD STAFF LIST ---
        const staffList = removedStaff
          ? staffEntries
              .map(
                staff =>
                  `• <@${staff.userId}> — removed from **${staff.position}**`
              )
              .join('\n')
          : '*No staff positions existed.*';

        // --- BUILD LOG EMBED ---
        const embed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setAuthor({
            name: guild.name,
            iconURL: guild.iconURL({ size: 256 }) || undefined,
          })
          .setTitle('Team Removed')
          .addFields(
            {
              name: 'Division',
              value: team.division || 'Unknown',
              inline: false,
            },
            {
              name: 'Team',
              value: `${team.emoji || ''} **${team.name}**`,
              inline: false,
            },
            {
              name: 'Players Removed',
              value: `${removedPlayers.length}`,
              inline: true,
            },
            {
              name: 'Staff Removed',
              value: `${removedStaff}`,
              inline: true,
            },
            {
              name: 'Removed By',
              value: `<@${interaction.user.id}>`,
              inline: false,
            },
            {
              name: 'Players Affected',
              value: limitField(playerList),
              inline: false,
            },
            {
              name: 'Staff Affected',
              value: limitField(staffList),
              inline: false,
            }
          )
          .setTimestamp();

        const teamLogoUrl = getTeamLogoUrl(team.emoji);

        if (teamLogoUrl) {
          embed.setThumbnail(teamLogoUrl);
        } else if (guild.iconURL()) {
          embed.setThumbnail(guild.iconURL({ size: 256 }));
        }

        // --- SEND LOG WITHOUT PINGING ANYONE ---
        await logAction(client, {
          embeds: [embed],
          allowedMentions: { parse: [] },
        });

        collector.stop('completed');

        await i.update({
          content:
            `Team **${team.emoji || ''} ${team.name}** from **${team.division || 'Unknown'}** has been removed.\n` +
            `Removed **${removedPlayers.length}** players and **${removedStaff}** staff.\n` +
            `Removed by <@${interaction.user.id}>.`,
          components: [],
          allowedMentions: { parse: [] },
        });
      } catch (err) {
        console.error('Error in /removeteam:', err);

        if (i.deferred || i.replied) {
          await i.editReply({
            content: 'An error occurred while removing the team.',
            components: [],
          }).catch(() => {});
        } else {
          await i.update({
            content: 'An error occurred while removing the team.',
            components: [],
          }).catch(() => {});
        }

        collector.stop('error');
      }
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'completed' || reason === 'team-missing') return;

      if (reason === 'error') return;

      if (collected.size === 0) {
        interaction.editReply({
          content: 'No selection made. Command cancelled.',
          components: [],
        }).catch(() => {});
      }
    });
  },
};
