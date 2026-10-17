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
            emoji: division.emoji || undefined,
          }))
        );

      const divisionRow = new ActionRowBuilder().addComponents(divisionMenu);

      await interaction.editReply({
        content: 'Select the league containing the team you want to disband:',
        components: [divisionRow],
      });

      const divisionCollector =
        interaction.channel.createMessageComponentCollector({
          filter: i =>
            i.customId === 'disband-division-select' &&
            i.user.id === interaction.user.id &&
            i.message.interactionMetadata?.user?.id === interaction.user.id,
          time: 60_000,
          max: 1,
        });

      divisionCollector.on('collect', async divisionInteraction => {
        try {
          await divisionInteraction.deferUpdate();

          const divisionName = divisionInteraction.values[0];
          const teams = await Teams.find({ division: divisionName })
            .sort({ name: 1 });

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
                emoji: team.emoji || undefined,
                description: `League: ${divisionName}`.slice(0, 100),
              }))
            );

          const teamRow = new ActionRowBuilder().addComponents(teamMenu);

          await interaction.editReply({
            content: `League: **${divisionName}**\nSelect the team you want to disband:`,
            components: [teamRow],
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

              // Recheck the team and league from the database.
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
                  `Are you sure you want to disband **${team.name}** from **${divisionName}**?\n` +
                  'This will remove its player and matching staff roles from members.',
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

                  // Fetch the guild member list so role.members includes
                  // members who were not previously cached.
                  await guild.members.fetch();

                  const staffEntries = await Staffs.find({
                    teamRoleId: team.roleId,
                  });

                  const roleIds = new Set([team.roleId]);

                  // The staff schema has no roleId field, so match each
                  // stored position to a role with that exact name.
                  for (const staff of staffEntries) {
                    const staffRole = guild.roles.cache.find(
                      role => role.name === staff.position
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

                  await Staffs.deleteMany({
                    teamRoleId: team.roleId,
                  });

                  const removedPlayers = removedByRole.filter(
                    entry => entry.roleId === team.roleId
                  );

                  const removedStaffRoles = removedByRole.filter(
                    entry => entry.roleId !== team.roleId
                  );

                  const formatRoleRemoval = entries => {
                    if (!entries.length) {
                      return '*Nobody lost this role.*';
                    }

                    const lines = entries.map(
                      entry =>
                        `• <@${entry.userId}> — **${entry.roleName}**`
                    );

                    const fullText = lines.join('\n');
                    if (fullText.length <= 1024) {
                      return fullText;
                    }

                    let output = '';
                    let shown = 0;

                    for (const line of lines) {
                      const addition = `${output ? '\n' : ''}${line}`;
                      if ((output + addition).length > 900) break;
                      output += addition;
                      shown++;
                    }

                    return (
                      `${output}\n...and ${entries.length - shown} more. ` +
                      'See the server logs for the complete result.'
                    );
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
                        value: formatRoleRemoval(removedPlayers),
                        inline: false,
                      },
                      {
                        name: 'Members Who Lost Staff Roles',
                        value: formatRoleRemoval(removedStaffRoles),
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

                  // Send the full list in follow-up messages if it is too
                  // long for the embed, while keeping each message under limits.
                  const fullRemovalLines = removedByRole.map(
                    entry =>
                      `• <@${entry.userId}> — ${entry.roleName}`
                  );

                  const chunks = [];
                  let chunk = '';

                  for (const line of fullRemovalLines) {
                    if (`${chunk}\n${line}`.length > 1800) {
                      chunks.push(chunk);
                      chunk = line;
                    } else {
                      chunk += `${chunk ? '\n' : ''}${line}`;
                    }
                  }

                  if (chunk) chunks.push(chunk);

                  await interaction.editReply({
                    content:
                      `**${team.name}** has been disbanded.\n` +
                      `Player role removals: **${removedPlayers.length}**\n` +
                      `Staff role removals: **${removedStaffRoles.length}**\n` +
                      `Failed removals: **${failures.length}**`,
                    components: [],
                  });

                  for (let index = 0; index < chunks.length; index++) {
                    await interaction.followUp({
                      content:
                        `**Role removals (${index + 1}/${chunks.length})**\n${chunks[index]}`,
                      flags: MessageFlags.Ephemeral,
                    });
                  }
                } catch (error) {
                  console.error('Disband confirmation failed:', error);

                  await interaction.editReply({
                    content:
                      'Something went wrong while disbanding the team. Check the bot console for details.',
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
