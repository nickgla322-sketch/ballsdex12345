
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const {
  DISBAND_ROLE,
  ASSISTANT_MANAGER_ROLE,
  MANAGER_ROLE,
  CHAIRMAN_ROLE,
} = require('../../utils/permissions');

const { logAction } = require('../../utils/logger');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');
const Divisions = require('../../models/divisions');

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

function prettyPosition(position) {
  switch (position) {
    case 'assistant':
      return 'Assistant Manager';
    case 'manager':
      return 'Manager';
    case 'chairman':
      return 'Chairman';
    default:
      return position || 'Unknown';
  }
}

// Get the image URL for a custom Discord emoji.
function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);

  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

function formatMembers(ids, staffByUserId, includePosition = false) {
  if (!ids.length) return '• None';

  const lines = ids.map(id => {
    const staff = staffByUserId.get(id);

    if (includePosition && staff) {
      return `• <@${id}> — ${prettyPosition(staff.position)}`;
    }

    return `• <@${id}>`;
  });

  const result = lines.join('\n');

  // Discord embed field values have a 1024-character limit.
  if (result.length <= 1024) return result;

  return `${result.slice(0, 990)}\n...list shortened.`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('disband')
    .setDescription('Remove all players and staff from a team'),

  async execute(interaction, client) {
    const allowedRoles = Array.isArray(DISBAND_ROLE)
      ? DISBAND_ROLE
      : [DISBAND_ROLE];

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
          'There are no leagues in the database.'
        );
      }

      if (divisions.length > 25) {
        return interaction.editReply(
          'There are too many leagues to display (maximum 25).'
        );
      }

      const divisionMenu = new StringSelectMenuBuilder()
        .setCustomId('disband-division-select')
        .setPlaceholder('Select a league')
        .addOptions(
          divisions.map(division => ({
            label: division.name.slice(0, 100),
            value: division.name,
            ...(division.emoji ? { emoji: division.emoji } : {}),
          }))
        );

      await interaction.editReply({
        content: 'Select the league containing the team:',
        components: [
          new ActionRowBuilder().addComponents(divisionMenu),
        ],
      });

      const divisionCollector =
        interaction.channel.createMessageComponentCollector({
          filter: i =>
            i.customId === 'disband-division-select' &&
            i.user.id === interaction.user.id,
          time: 60_000,
          max: 1,
        });

      divisionCollector.on('collect', async divisionInteraction => {
        try {
          await divisionInteraction.deferUpdate();

          const divisionName = divisionInteraction.values[0];

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
              content: `**${divisionName}** has too many teams to display (maximum 25).`,
              components: [],
            });
          }

          const teamMenu = new StringSelectMenuBuilder()
            .setCustomId('disband-team-select')
            .setPlaceholder('Select a team')
            .addOptions(
              teams.map(team => ({
                label: team.name.slice(0, 100),
                value: team.roleId,
                ...(team.emoji ? { emoji: team.emoji } : {}),
              }))
            );

          await interaction.editReply({
            content: `League: **${divisionName}**\nSelect the team to empty:`,
            components: [
              new ActionRowBuilder().addComponents(teamMenu),
            ],
          });

          const teamCollector =
            interaction.channel.createMessageComponentCollector({
              filter: i =>
                i.customId === 'disband-team-select' &&
                i.user.id === interaction.user.id,
              time: 60_000,
              max: 1,
            });

          teamCollector.on('collect', async teamInteraction => {
            try {
              await teamInteraction.deferUpdate();

              const teamRoleId = teamInteraction.values[0];

              const team = await Teams.findOne({
                roleId: teamRoleId,
                division: divisionName,
              });

              if (!team) {
                return interaction.editReply({
                  content: 'That team could not be found.',
                  components: [],
                });
              }

              const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('disband-confirm')
                  .setLabel('Empty Team')
                  .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                  .setCustomId('disband-cancel')
                  .setLabel('Cancel')
                  .setStyle(ButtonStyle.Secondary)
              );

              await interaction.editReply({
                content:
                  `Are you sure you want to empty <@&${team.roleId}>?\n\n` +
                  'This removes the team role from its players and staff, ' +
                  'removes team-specific staff roles, and deletes its staff records.\n\n' +
                  '**The team, team role, and league will remain.**',
                components: [confirmRow],
              });

              const confirmCollector =
                interaction.channel.createMessageComponentCollector({
                  filter: i =>
                    ['disband-confirm', 'disband-cancel'].includes(i.customId) &&
                    i.user.id === interaction.user.id,
                  time: 30_000,
                  max: 1,
                });

              confirmCollector.on('collect', async confirmInteraction => {
                try {
                  await confirmInteraction.deferUpdate();

                  if (confirmInteraction.customId === 'disband-cancel') {
                    return interaction.editReply({
                      content: 'Disband cancelled. Nothing was changed.',
                      components: [],
                    });
                  }

                  const guild = interaction.guild;

                  // Load staff records for this team only.
                  const staffEntries = await Staffs.find({
                    teamRoleId: team.roleId,
                  });

                  // Fetch members once to include uncached members.
                  let members;

                  try {
                    members = await guild.members.fetch();
                  } catch (fetchError) {
                    console.error(
                      'Could not fetch guild members:',
                      fetchError
                    );

                    return interaction.editReply({
                      content:
                        'Could not load all server members. No roles or staff records were changed. ' +
                        'Wait a few seconds and try again.',
                      components: [],
                    });
                  }

                  const staffByUserId = new Map(
                    staffEntries.map(staff => [staff.userId, staff])
                  );

                  const removedStaffRoles = [];
                  const removedTeamRoles = [];
                  const failedMembers = [];

                  // Remove staff hierarchy roles belonging to this team.
                  for (const staff of staffEntries) {
                    const member = members.get(staff.userId);
                    if (!member) continue;

                    const staffRoleId = getStaffRoleId(staff.position);

                    if (
                      staffRoleId &&
                      member.roles.cache.has(staffRoleId)
                    ) {
                      try {
                        await member.roles.remove(
                          staffRoleId,
                          `Disbanding ${team.name}: removing team staff role`
                        );

                        removedStaffRoles.push({
                          userId: staff.userId,
                          position: staff.position,
                        });
                      } catch (error) {
                        console.error(
                          `Failed to remove staff role from ${staff.userId}:`,
                          error
                        );

                        if (!failedMembers.includes(staff.userId)) {
                          failedMembers.push(staff.userId);
                        }
                      }
                    }
                  }

                  // Remove the selected team role from all its holders.
                  const teamRoleMembers = members.filter(member =>
                    member.roles.cache.has(team.roleId)
                  );

                  for (const member of teamRoleMembers.values()) {
                    try {
                      await member.roles.remove(
                        team.roleId,
                        `Disbanding ${team.name}: emptying team roster`
                      );

                      removedTeamRoles.push(member.id);
                    } catch (error) {
                      console.error(
                        `Failed to remove team role from ${member.id}:`,
                        error
                      );

                      if (!failedMembers.includes(member.id)) {
                        failedMembers.push(member.id);
                      }
                    }
                  }

                  // Keep the Team record. Delete only its staff records.
                  const deleteResult = await Staffs.deleteMany({
                    teamRoleId: team.roleId,
                  });

                  // Split successfully removed team-role holders into staff
                  // and actual players so they are not double-counted.
                  const staffIds = new Set(
                    staffEntries.map(staff => staff.userId)
                  );

                  const removedStaffIds = removedTeamRoles.filter(
                    id => staffIds.has(id)
                  );

                  const removedPlayerIds = removedTeamRoles.filter(
                    id => !staffIds.has(id)
                  );

                  const embed = new EmbedBuilder()
                    .setColor('#c0392b')
                    .setAuthor({
                      name: guild.name,
                      iconURL: guild.iconURL({ size: 256 }) || undefined,
                    })
                    .setTitle('Team Disbanded')
                    .setThumbnail(getTeamLogoUrl(team.emoji))
                    .addFields(
                      {
                  {
                    name: 'Team',
                    value: `${team.emoji || ''} <@&${team.roleId}>`,
                      inline: false,
                    },
                      },
                      {
                        name: 'Staff Records Deleted',
                        value: String(deleteResult.deletedCount || 0),
                        inline: false,
                      },
                      {
                        name: 'Disbanded By',
                        value: `<@${interaction.user.id}>`,
                        inline: false,
                      },
                      {
                        name: 'Staff Members',
                        value: formatMembers(
                          removedStaffIds,
                          staffByUserId,
                          true
                        ),
                        inline: false,
                      },
                      {
                        name: 'Players',
                        value: formatMembers(
                          removedPlayerIds,
                          staffByUserId
                        ),
                        inline: false,
                      }
                    )
                    .setTimestamp();

                  // Ping the command user and members whose team role
                  // was successfully removed. Send the log only once.
                  const pingIds = [
                    ...new Set([
                      interaction.user.id,
                      ...removedStaffIds,
                      ...removedPlayerIds,
                    ]),
                  ];

                  const pingContent = pingIds
                    .map(id => `<@${id}>`)
                    .join(' ');

                  await logAction(client, {
                    content: pingContent.slice(0, 2000),
                    embeds: [embed],
                    allowedMentions: {
                      users: pingIds,
                      parse: [],
                    },
                  });

                  await interaction.editReply({
                    content:
                      `Finished emptying <@&${team.roleId}>.\n\n` +
                      `• Actual players removed: **${removedPlayerIds.length}**\n` +
                      `• Staff members removed: **${removedStaffIds.length}**\n` +
                      `• Staff roles removed: **${removedStaffRoles.length}**\n` +
                      `• Staff records deleted: **${deleteResult.deletedCount || 0}**\n` +
                      `• Members with role-removal errors: **${failedMembers.length}**\n\n` +
                      'The team record, team Discord role, and league were kept.',
                    components: [],
                  });
                } catch (error) {
                  console.error('Disband confirmation failed:', error);

                  await interaction.editReply({
                    content:
                      'Something went wrong while emptying the team. ' +
                      'Check the bot console for details.',
                    components: [],
                  }).catch(() => {});
                }
              });

              confirmCollector.on('end', async collected => {
                if (collected.size === 0) {
                  await interaction.editReply({
                    content: 'Confirmation timed out. Nothing was changed.',
                    components: [],
                  }).catch(() => {});
                }
              });
            } catch (error) {
              console.error('Team selection failed:', error);

              await interaction.editReply({
                content: 'Something went wrong selecting the team.',
                components: [],
              }).catch(() => {});
            }
          });

          teamCollector.on('end', async collected => {
            if (collected.size === 0) {
              await interaction.editReply({
                content: 'No team selected. Command cancelled.',
                components: [],
              }).catch(() => {});
            }
          });
        } catch (error) {
          console.error('League selection failed:', error);

          await interaction.editReply({
            content: 'Something went wrong selecting the league.',
            components: [],
          }).catch(() => {});
        }
      });

      divisionCollector.on('end', async collected => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: 'No league selected. Command cancelled.',
            components: [],
          }).catch(() => {});
        }
      });
    } catch (error) {
      console.error('Disband command failed:', error);

      await interaction.editReply(
        'Something went wrong loading the leagues. Check the bot console.'
      ).catch(() => {});
    }
  },
};
