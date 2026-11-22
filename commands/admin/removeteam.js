
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const {
  REMOVE_TEAM_ROLE,
  ASSISTANT_MANAGER_ROLE,
  MANAGER_ROLE,
  CHAIRMAN_ROLE,
} = require('../../utils/permissions');

const { logAction } = require('../../utils/logger');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');
const Divisions = require('../../models/divisions');

const FREE_AGENT_ROLE_ID = '1374495332846669956';

// Maps each staff position to its Discord role.
function getStaffRoleId(position) {
  const roles = {
    assistant: ASSISTANT_MANAGER_ROLE,
    manager: MANAGER_ROLE,
    chairman: CHAIRMAN_ROLE,
  };

  return roles[position] || null;
}

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
    const allowedRoles = (
      Array.isArray(REMOVE_TEAM_ROLE)
        ? REMOVE_TEAM_ROLE
        : [REMOVE_TEAM_ROLE]
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
                content:
                  `**${divisionName}** has too many teams to display. ` +
                  'The maximum is 25.',
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

          // Find the division selected in the previous menu.
          const currentMessage = await interaction.fetchReply();

          const selectedDivisionMatch = currentMessage.content.match(
            /Division: \*\*(.+?)\*\*/
          );

          if (!selectedDivisionMatch) {
            collector.stop('error');

            return interaction.editReply({
              content:
                'Could not determine the selected division. Try again.',
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

          // Find all staff records belonging to this team.
          const staffEntries = await Staffs.find({
            teamRoleId: team.roleId,
          });

          // Load server members so uncached members can be handled too.
          let members;

          try {
            members = await guild.members.fetch();
          } catch (error) {
            console.error('Failed to fetch guild members:', error);

            collector.stop('error');

            return interaction.editReply({
              content:
                'Could not load all server members. No database records ' +
                'were deleted. Try again later.',
              components: [],
            });
          }

          // Find everyone affected by this team removal:
          // 1. Members with the team role.
          // 2. Members listed in the team's staff records.
          const affectedMemberIds = new Set();

          for (const member of members.values()) {
            if (member.roles.cache.has(team.roleId)) {
              affectedMemberIds.add(member.id);
            }
          }

          for (const staff of staffEntries) {
            affectedMemberIds.add(staff.userId);
          }

          const removedPlayers = [];
          const removedStaffRoles = [];
          const failedMembers = [];
          const staffRoleErrors = [];
          const freeAgentErrors = [];
          const affectedMembers = [];

          // Process every affected member, including staff who might not
          // currently have the team role.
          for (const userId of affectedMemberIds) {
            const member = members.get(userId);

            if (!member) {
              failedMembers.push(userId);
              continue;
            }

            affectedMembers.push(member);

            // Find this member's staff positions on the selected team.
            const memberStaffEntries = staffEntries.filter(
              staff => staff.userId === userId
            );

            const staffRoleIds = new Set(
              memberStaffEntries
                .map(staff => getStaffRoleId(staff.position))
                .filter(Boolean)
            );

            // Remove staff roles first. If any fail, leave the team role and
            // roster state untouched so the staff record can be retried.
            let staffCleanupSucceeded = true;
            for (const staffRoleId of staffRoleIds) {
              const positionForRole = memberStaffEntries.find(
                staff => getStaffRoleId(staff.position) === staffRoleId
              )?.position;
              const stillHasPositionElsewhere = positionForRole
                ? await Staffs.exists({
                    userId,
                    position: positionForRole,
                    teamRoleId: { $ne: team.roleId },
                  })
                : false;
              if (stillHasPositionElsewhere || !member.roles.cache.has(staffRoleId)) continue;
              try {
                await member.roles.remove(
                  staffRoleId,
                  `Staff position removed because team ${team.name} was removed`
                );
                removedStaffRoles.push({ userId, roleId: staffRoleId });
              } catch (error) {
                console.error(`Failed to remove staff role ${staffRoleId} from ${member.user.tag}:`, error);
                staffRoleErrors.push({ userId, roleId: staffRoleId });
                staffCleanupSucceeded = false;
              }
            }

            if (!staffCleanupSucceeded) continue;

            // Add Free Agent before removing the team role. This prevents a
            // failed Free Agent grant from making the member untraceable.
            const addedFreeAgent = !member.roles.cache.has(FREE_AGENT_ROLE_ID);
            if (addedFreeAgent) {
              try {
                await member.roles.add(FREE_AGENT_ROLE_ID, `Team ${team.name} was removed`);
              } catch (error) {
                console.error(`Failed to add Free Agent role to ${member.user.tag}:`, error);
                freeAgentErrors.push(userId);
                continue;
              }
            }

            if (member.roles.cache.has(team.roleId)) {
              try {
                await member.roles.remove(team.roleId, `Team ${team.name} was removed`);
                removedPlayers.push(member);
              } catch (error) {
                console.error(`Failed to remove team role from ${member.user.tag}:`, error);
                failedMembers.push(userId);
                if (addedFreeAgent) {
                  await member.roles.remove(FREE_AGENT_ROLE_ID, 'Rolling back incomplete team removal').catch(() => {});
                }
              }
            }
          }

          // Keep the database records intact if Discord cleanup was incomplete.
          // This makes the operation retryable instead of orphaning role holders.
          const removedStaff = staffEntries.length;
          if (failedMembers.length || staffRoleErrors.length || freeAgentErrors.length) {
            collector.stop('cleanup-incomplete');
            return interaction.editReply({
              content:
                'Team removal was not finalized because one or more Discord role updates failed or affected members could not be found. ' +
                'The team and staff database records were kept so cleanup can be retried. ' +
                `Team role errors: ${failedMembers.length}; staff role errors: ${staffRoleErrors.length}; Free Agent errors: ${freeAgentErrors.length}.`,
              components: [],
            });
          }

          await Staffs.deleteMany({ teamRoleId: team.roleId });
          await Teams.deleteOne({ _id: team._id });

          const playerList = affectedMembers.length
            ? affectedMembers
                .map(member => {
                  const hadTeamRole = member.roles.cache.has(team.roleId);
                  const teamRoleFailed = failedMembers.includes(member.id);
                  const freeAgentFailed = freeAgentErrors.includes(member.id);

                  let status;

                  if (teamRoleFailed && hadTeamRole) {
                    status = 'Team role removal failed';
                  } else if (freeAgentFailed) {
                    status = 'Free Agent role addition failed';
                  } else {
                    status = 'Processed';
                  }

                  return `• <@${member.id}> - ${status}`;
                })
                .join('\n')
            : '*No affected members were found.*';

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
                name: 'Affected Members',
                value: String(affectedMembers.length),
                inline: true,
              },
              {
                name: 'Team Roles Removed',
                value: String(removedPlayers.length),
                inline: true,
              },
              {
                name: 'Staff Roles Removed',
                value: String(removedStaffRoles.length),
                inline: true,
              },
              {
                name: 'Staff Records Deleted',
                value: String(removedStaff),
                inline: true,
              },
              {
                name: 'Team Role Errors',
                value: String(failedMembers.length),
                inline: true,
              },
              {
                name: 'Staff Role Errors',
                value: String(staffRoleErrors.length),
                inline: true,
              },
              {
                name: 'Free Agent Role Errors',
                value: String(freeAgentErrors.length),
                inline: true,
              },
              {
                name: 'Members Not Found',
                value: String(
                  [...affectedMemberIds].filter(
                    userId => !members.has(userId)
                  ).length
                ),
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
              `Team **${team.emoji || ''} ${team.name}** from ` +
              `**${team.division || 'Unknown'}** has been removed.\n` +
              `Affected members: **${affectedMembers.length}**.\n` +
              `Team roles removed: **${removedPlayers.length}**.\n` +
              `Staff roles removed: **${removedStaffRoles.length}**.\n` +
              `Free Agent role errors: **${freeAgentErrors.length}**.\n` +
              `Team role errors: **${failedMembers.length}**.\n` +
              `Staff role errors: **${staffRoleErrors.length}**.\n` +
              `Deleted **${removedStaff}** staff records.\n` +
              `Removed by <@${interaction.user.id}>.`,
            components: [],
            allowedMentions: { parse: [] },
          });
        } catch (error) {
          console.error('Error in /removeteam:', error);

          collector.stop('error');

          await interaction.editReply({
            content:
              'An error occurred while removing the team. Check the bot console.',
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
