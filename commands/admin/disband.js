const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const { DISBAND_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');
const Divisions = require('../../models/divisions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('disband')
    .setDescription('Disband a team and remove its player and staff roles'),

  async execute(interaction, client) {
    const allowedRoles = Array.isArray(DISBAND_ROLE)
      ? DISBAND_ROLE
      : [DISBAND_ROLE];

    if (
      !allowedRoles.some(
        roleId => roleId && interaction.member.roles.cache.has(roleId)
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
        return interaction.editReply('There are no leagues in the database.');
      }

      if (divisions.length > 25) {
        return interaction.editReply(
          'There are too many leagues to display in one dropdown (maximum 25).'
        );
      }

      const divisionMenu = new StringSelectMenuBuilder()
        .setCustomId('disband-division-select')
        .setPlaceholder('Select the league')
        .addOptions(
          divisions.map(division => ({
            label: division.name.slice(0, 100),
            value: division.name,
            ...(division.emoji ? { emoji: division.emoji } : {}),
          }))
        );

      await interaction.editReply({
        content: 'Select the league containing the team you want to disband:',
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
              content: `**${divisionName}** has too many teams to display in one dropdown (maximum 25).`,
              components: [],
            });
          }

          const teamMenu = new StringSelectMenuBuilder()
            .setCustomId('disband-team-select')
            .setPlaceholder('Select the team to disband')
            .addOptions(
              teams.map(team => ({
                label: team.name.slice(0, 100),
                value: team.roleId,
                ...(team.emoji ? { emoji: team.emoji } : {}),
                description: `League: ${divisionName}`.slice(0, 100),
              }))
            );

          await interaction.editReply({
            content:
              `League: **${divisionName}**\n` +
              'Select the team you want to disband:',
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
                  content: 'That team could not be found in the selected league.',
                  components: [],
                });
              }

              const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('disband-confirm')
                  .setLabel('Disband Team')
                  .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                  .setCustomId('disband-cancel')
                  .setLabel('Cancel')
                  .setStyle(ButtonStyle.Secondary)
              );

              await interaction.editReply({
                content:
                  `Are you sure you want to disband **${team.name}** ` +
                  `from **${divisionName}**?\n` +
                  'This removes the team player role and matching staff roles.',
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
                      content: 'Disband cancelled.',
                      components: [],
                    });
                  }

                  await interaction.editReply({
                    content: `Disbanding **${team.name}**...`,
                    components: [],
                  });

                  const guild = interaction.guild;

                  // IMPORTANT:
                  // Do NOT call guild.members.fetch() here.
                  // It requests every guild member and can trigger
                  // the Gateway opcode 8 rate limit.

                  const staffEntries = await Staffs.find({
                    teamRoleId: team.roleId,
                  });

                  // Start with the team's player role.
                  const roleIds = new Set([team.roleId]);

                  // Your Staffs model stores position names, not role IDs.
                  // Find matching role names, but avoid adding the team
                  // role twice.
                  for (const staff of staffEntries) {
                    const staffRole = guild.roles.cache.find(
                      role =>
                        role.name === staff.position &&
                        role.id !== team.roleId
                    );

                    if (staffRole) {
                      roleIds.add(staffRole.id);
                    }
                  }

                  const removedByRole = [];
                  const failures = [];

                  for (const roleId of roleIds) {
                    const role = guild.roles.cache.get(roleId);

                    if (!role) {
                      failures.push(`Role not found: ${roleId}`);
                      continue;
                    }

                    // Only members already present in the cache are
                    // processed. No full guild-member fetch is performed.
                    const membersWithRole = [...role.members.values()];

                    for (const member of membersWithRole) {
                      try {
                        await member.roles.remove(
                          roleId,
                          `Team ${team.name} disbanded by ${interaction.user.tag}`
                        );

                        removedByRole.push({
                          userId: member.id,
                          username: member.user.tag,
                          roleName: role.name,
                          roleId: role.id,
                        });
                      } catch (error) {
                        console.error(
                          `Failed to remove ${role.name} from ${member.user.tag}:`,
                          error
                        );

                        failures.push(
                          `${member.user.tag} — ${role.name}`
                        );
                      }
                    }
                  }

                  // Delete the team's staff records.
                  await Staffs.deleteMany({
                    teamRoleId: team.roleId,
                  });

                  // Remove the team from the teams collection.
                  await Teams.deleteOne({
                    roleId: team.roleId,
                    division: divisionName,
                  });

                  const removedPlayers = removedByRole.filter(
                    entry => entry.roleId === team.roleId
                  );

                  const removedStaffRoles = removedByRole.filter(
                    entry => entry.roleId !== team.roleId
                  );

                  const formatRemovalList = entries => {
                    if (!entries.length) {
                      return '*No cached members lost this role.*';
                    }

                    const lines = entries.map(
                      entry =>
                        `• <@${entry.userId}> — **${entry.roleName}**`
                    );

                    let result = '';
                    let shown = 0;

                    for (const line of lines) {
                      const next = `${result ? '\n' : ''}${line}`;

                      if ((result + next).length > 900) {
                        break;
                      }

                      result += next;
                      shown++;
                    }

                    if (shown < entries.length) {
                      result += `\n...and ${entries.length - shown} more.`;
                    }

                    return result;
                  };

                  const embed = new EmbedBuilder()
                    .setColor('#c0392b')
                    .setTitle('Team Disbanded')
                    .setAuthor({
                      name: guild.name,
                      iconURL: guild.iconURL({ size: 256 }) || undefined,
                    })
                    .setThumbnail(
                      guild.iconURL({ size: 256 }) || undefined
                    )
                    .addFields(
                      {
                        name: 'Team',
                        value: `${team.emoji || ''} <@&${team.roleId}>`,
                        inline: false,
                      },
                      {
                        name: 'League',
                        value: divisionName,
                        inline: true,
                      },
                      {
                        name: 'Player Role Removals',
                        value: String(removedPlayers.length),
                        inline: true,
                      },
                      {
                        name: 'Staff Role Removals',
                        value: String(removedStaffRoles.length),
                        inline: true,
                      },
                      {
                        name: 'Disbanded By',
                        value: `<@${interaction.user.id}>`,
                        inline: false,
                      },
                      {
                        name: 'Players Who Lost the Team Role',
                        value: formatRemovalList(removedPlayers),
                        inline: false,
                      },
                      {
                        name: 'Members Who Lost Staff Roles',
                        value: formatRemovalList(removedStaffRoles),
                        inline: false,
                      },
                      {
                        name: 'Role Removal Failures',
                        value: failures.length
                          ? failures.slice(0, 10).join('\n').slice(0, 1024)
                          : 'None',
                        inline: false,
                      }
                    )
                    .setTimestamp();

                  await logAction(client, { embeds: [embed] });

                  // Send all successfully removed roles in follow-up messages.
                  const lines = removedByRole.map(
                    entry =>
                      `• <@${entry.userId}> — ${entry.roleName}`
                  );

                  const chunks = [];
                  let chunk = '';

                  for (const line of lines) {
                    const next = `${chunk ? '\n' : ''}${line}`;

                    if ((chunk + next).length > 1800) {
                      chunks.push(chunk);
                      chunk = line;
                    } else {
                      chunk += next;
                    }
                  }

                  if (chunk) {
                    chunks.push(chunk);
                  }

                  await interaction.editReply({
                    content:
                      `**${team.name}** has been disbanded.\n` +
                      `Player role removals: **${removedPlayers.length}**\n` +
                      `Staff role removals: **${removedStaffRoles.length}**\n` +
                      `Failed removals: **${failures.length}**\n\n` +
                      'Note: only members in the current cache were checked.',
                    components: [],
                  });

                  for (let index = 0; index < chunks.length; index++) {
                    await interaction.followUp({
                      content:
                        `**Role removals (${index + 1}/${chunks.length})**\n` +
                        chunks[index],
                      flags: MessageFlags.Ephemeral,
                    });
                  }
                } catch (error) {
                  console.error('Disband confirmation failed:', error);

                  await interaction.editReply({
                    content:
                      'Something went wrong while disbanding the team. ' +
                      'Check the bot console for details.',
                    components: [],
                  }).catch(() => {});
                }
              });

              confirmCollector.on('end', async collected => {
                if (collected.size === 0) {
                  await interaction.editReply({
                    content: 'Confirmation timed out. Disband cancelled.',
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
