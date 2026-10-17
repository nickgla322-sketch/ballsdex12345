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
    .setDescription('Remove a team and its staff records from the database'),

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
            content: `League: **${divisionName}**\nSelect the team you want to disband:`,
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
                  `from **${divisionName}**?\n\n` +
                  'This deletes the team and its staff records from the database. ' +
                  'No Discord roles will be changed.',
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

                  // Get the team's staff records before deleting them,
                  // so they can be included in the log.
                  const staffEntries = await Staffs.find({
                    teamRoleId: team.roleId,
                  });

                  const staffList = staffEntries.length
                    ? staffEntries
                        .map(
                          staff =>
                            `• <@${staff.userId}> — ${staff.position}`
                        )
                        .join('\n')
                    : '*No staff records found.*';

                  // Remove the staff records and team record from MongoDB.
                  await Staffs.deleteMany({
                    teamRoleId: team.roleId,
                  });

                  await Teams.deleteOne({
                    roleId: team.roleId,
                    division: divisionName,
                  });

                  const embed = new EmbedBuilder()
                    .setColor('#c0392b')
                    .setTitle('Team Disbanded')
                    .setAuthor({
                      name: interaction.guild.name,
                      iconURL:
                        interaction.guild.iconURL({ size: 256 }) || undefined,
                    })
                    .addFields(
                      {
                        name: 'Team',
                        value: `${team.emoji || ''} ${team.name}`,
                        inline: false,
                      },
                      {
                        name: 'League',
                        value: divisionName,
                        inline: true,
                      },
                      {
                        name: 'Staff Records Deleted',
                        value: String(staffEntries.length),
                        inline: true,
                      },
                      {
                        name: 'Disbanded By',
                        value: `<@${interaction.user.id}>`,
                        inline: false,
                      },
                      {
                        name: 'Staff Members',
                        value:
                          staffList.length <= 1024
                            ? staffList
                            : `${staffList.slice(0, 950)}\n...list shortened.`,
                        inline: false,
                      },
                      {
                        name: 'Discord Roles',
                        value: 'No roles were changed.',
                        inline: false,
                      }
                    )
                    .setTimestamp();

                  await logAction(client, { embeds: [embed] });

                  await interaction.editReply({
                    content:
                      `**${team.name}** has been disbanded.\n` +
                      `Deleted **${staffEntries.length}** staff records and the team record from MongoDB.\n` +
                      'No Discord roles were changed.',
                    components: [],
                  });
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
