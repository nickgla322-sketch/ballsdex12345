
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { REMOVE_TEAM_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');
const Divisions = require('../../models/divisions');

const FREE_AGENT_ROLE_ID = '1374495332846669956';

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);
  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

function limitField(text, maxLength = 1024) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 20)}\n...and more.`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removeteam')
    .setDescription('Remove a team'),

  async execute(interaction, client) {
    const allowedRoles = Array.isArray(REMOVE_TEAM_ROLE)
      ? REMOVE_TEAM_ROLE
      : [REMOVE_TEAM_ROLE];

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

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const divisions = await Divisions.find().sort({ name: 1 });

      if (!divisions.length) {
        return interaction.editReply(
          'There are no divisions to select.'
        );
      }

      if (divisions.length > 25) {
        return interaction.editReply(
          'There are too many divisions to display. The maximum is 25.'
        );
      }

      const divisionMenu = new StringSelectMenuBuilder()
        .setCustomId('remove-team-division-select')
        .setPlaceholder('Select a division')
        .addOptions(
          divisions.map(division => ({
            label: division.name.slice(0, 100),
            value: division.name,
            ...(division.emoji ? { emoji: division.emoji } : {}),
          }))
        );

      await interaction.editReply({
        content: 'First, choose the division containing the team:',
        components: [
          new ActionRowBuilder().addComponents(divisionMenu),
        ],
      });

      const response = await interaction.fetchReply();

      const collector = response.createMessageComponentCollector({
        filter: i =>
          i.user.id === interaction.user.id &&
          [
            'remove-team-division-select',
            'remove-team-team-select',
          ].includes(i.customId),
        time: 60_000,
      });

      collector.on('collect', async i => {
        try {
          if (i.customId === 'remove-team-division-select') {
            await i.deferUpdate();

            const divisionName = i.values[0];

            const teams = await Teams.find({
              division: divisionName,
            }).sort({ name: 1 });

            if (!teams.length) {
              return interaction.editReply({
                content: `There are no teams in **${divisionName}**.`,
                components: [],
              });
            }

            if (teams.length > 25) {
              return interaction.editReply({
                content: `**${divisionName}** has too many teams to display. The maximum is 25.`,
                components: [],
              });
            }

            const teamMenu = new StringSelectMenuBuilder()
              .setCustomId('remove-team-team-select')
              .setPlaceholder('Select a team to remove')
              .addOptions(
                teams.map(team => ({
                  label: team.name.slice(0, 100),
                  value: team.roleId,
                  ...(team.emoji ? { emoji: team.emoji } : {}),
                }))
              );

            return interaction.editReply({
              content:
                `Division: **${divisionName}**\n` +
                'Now choose the team you want to remove:',
              components: [
                new ActionRowBuilder().addComponents(teamMenu),
              ],
            });
          }

          await i.deferUpdate();

          const teamRoleId = i.values[0];

          // Find the team within the selected division.
          const currentMessage = await interaction.fetchReply();
          const selectedDivisionMatch = currentMessage.content.match(
            /Division: \*\*(.+?)\*\*/
          );

          if (!selectedDivisionMatch) {
            collector.stop('error');

            return interaction.editReply({
              content: 'Could not determine the selected division. Try again.',
              components: [],
            });
          }

          const divisionName = selectedDivisionMatch[1];

          const team = await Teams.findOne({
            roleId: teamRoleId,
            division: divisionName,
          });

          if (!team) {
            collector.stop('team-missing');

            return interaction.editReply({
              content: 'This team no longer exists in that division.',
              components: [],
            });
          }

          const guild = interaction.guild;
          const role = guild.roles.cache.get(team.roleId);

          const staffEntries = await Staffs.find({
            teamRoleId,
          });

          const removedPlayers = [];
          const failedMembers = [];
          const freeAgentErrors = [];

          // Fetch members so uncached members can also be handled.
          let members;

          try {
            members = await guild.members.fetch();
          } catch (error) {
            console.error('Failed to fetch guild members:', error);

            collector.stop('error');

            return interaction.editReply({
              content:
                'Could not load all server members. No database records were deleted. Try again later.',
              components: [],
            });
          }

          if (role) {
            const roleMembers = members.filter(member =>
              member.roles.cache.has(team.roleId)
            );

            for (const member of roleMembers.values()) {
              try {
                // Remove the team role.
                await member.roles.remove(
                  team.roleId,
                  `Removing team ${team.name}`
                );

                // Add Free Agent role to the member.
                try {
                  if (!member.roles.cache.has(FREE_AGENT_ROLE_ID)) {
                    await member.roles.add(
                      FREE_AGENT_ROLE_ID,
                      `Team ${team.name} was removed`
                    );
                  }

                  removedPlayers.push(member);
                } catch (error) {
                  console.error(
                    `Failed to add Free Agent role to ${member.user.tag}:`,
                    error
                  );

                  // The team role was removed, but Free Agent could not be added.
                  removedPlayers.push(member);
                  freeAgentErrors.push(member.id);
                }
              } catch (error) {
                console.error(
                  `Failed to remove team role from ${member.user.tag}:`,
                  error
                );

                failedMembers.push(member.id);
              }
            }
          }

          // Remove staff records only after attempting role removals.
          const removedStaff = staffEntries.length;

          await Staffs.deleteMany({ teamRoleId });

          await Teams.deleteOne({
            _id: team._id,
          });

          const playerList = removedPlayers.length
            ? removedPlayers
                .map(
                  member =>
                    `• <@${member.id}> - removed from **${team.name}**, Free Agent role processed`
                )
                .join('\n')
            : '*No players had the role or no role was found.*';

          const staffList = removedStaff
            ? staffEntries
                .map(
                  staff =>
                    `• <@${staff.userId}> - removed from **${staff.position}**`
                )
                .join('\n')
            : '*No staff positions existed.*';

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
                value: String(removedPlayers.length),
                inline: true,
              },
              {
                name: 'Staff Records Deleted',
                value: String(removedStaff),
                inline: true,
              },
              {
                name: 'Team Role Removal Errors',
                value: String(failedMembers.length),
                inline: true,
              },
              {
                name: 'Free Agent Role Errors',
                value: String(freeAgentErrors.length),
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

          await logAction(client, {
            embeds: [embed],
            allowedMentions: { parse: [] },
          });

          collector.stop('completed');

          await interaction.editReply({
            content:
              `Team **${team.emoji || ''} ${team.name}** from **${team.division || 'Unknown'}** has been removed.\n` +
              `Removed **${removedPlayers.length}** players from the team.\n` +
              `Free Agent role errors: **${freeAgentErrors.length}**.\n` +
              `Team role removal errors: **${failedMembers.length}**.\n` +
              `Deleted **${removedStaff}** staff records.\n` +
              `Removed by <@${interaction.user.id}>.`,
            components: [],
            allowedMentions: { parse: [] },
          });
        } catch (error) {
          console.error('Error in /removeteam:', error);

          collector.stop('error');

          await interaction.editReply({
            content: 'An error occurred while removing the team. Check the bot console.',
            components: [],
          }).catch(() => {});
        }
      });

      collector.on('end', async (collected, reason) => {
        if (
          reason === 'completed' ||
          reason === 'team-missing' ||
          reason === 'error'
        ) {
          return;
        }

        if (reason === 'time' || collected.size === 0) {
          await interaction.editReply({
            content: 'No selection made. Command cancelled.',
            components: [],
          }).catch(() => {});
        }
      });
    } catch (error) {
      console.error('Remove team command failed:', error);

      await interaction.editReply(
        'Something went wrong loading the divisions. Check the bot console.'
      ).catch(() => {});
    }
  },
};
