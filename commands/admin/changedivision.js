
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { DIVISION_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

const Divisions = require('../../models/divisions');
const Teams = require('../../models/teams');

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);
  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changedivision')
    .setDescription("Change a team's division without affecting its players or staff"),

  async execute(interaction, client) {
    const allowedRoles = (
      Array.isArray(DIVISION_ROLE) ? DIVISION_ROLE : [DIVISION_ROLE]
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

    let collector;

    try {
      const divisions = await Divisions.find().sort({ name: 1 });

      if (divisions.length < 2) {
        return interaction.editReply(
          "At least two divisions must exist to change a team's division."
        );
      }

      if (divisions.length > 25) {
        return interaction.editReply(
          'There are too many divisions to display. The maximum is 25.'
        );
      }

      let currentDivisionName = null;
      let selectedTeamRoleId = null;

      // Step 1: Select the current division.
      const divisionMenu = new StringSelectMenuBuilder()
        .setCustomId('change-division-current')
        .setPlaceholder('Select the current division')
        .addOptions(
          divisions.map(division => ({
            label: division.name.slice(0, 100),
            value: division.name,
          }))
        );

      await interaction.editReply({
        content: 'First, select the division the team is currently in:',
        components: [
          new ActionRowBuilder().addComponents(divisionMenu),
        ],
      });

      const response = await interaction.fetchReply();

      collector = response.createMessageComponentCollector({
        filter: i =>
          i.user.id === interaction.user.id &&
          [
            'change-division-current',
            'change-division-team',
            'change-division-target',
          ].includes(i.customId),
        time: 60_000,
      });

      collector.on('collect', async i => {
        try {
          await i.deferUpdate();

          // Step 1: Load teams from the selected division.
          if (i.customId === 'change-division-current') {
            currentDivisionName = i.values[0];

            const currentDivision = await Divisions.findOne({
              name: currentDivisionName,
            });

            if (!currentDivision) {
              collector.stop('error');

              return interaction.editReply({
                content: 'This division no longer exists. Please try again.',
                components: [],
              });
            }

            const teams = await Teams.find({
              division: currentDivision.name,
            }).sort({ name: 1 });

            if (!teams.length) {
              collector.stop('error');

              return interaction.editReply({
                content: `There are no teams in **${currentDivision.name}**.`,
                components: [],
              });
            }

            if (teams.length > 25) {
              collector.stop('error');

              return interaction.editReply({
                content:
                  `**${currentDivision.name}** has too many teams to display. ` +
                  'The maximum is 25.',
                components: [],
              });
            }

            const teamMenu = new StringSelectMenuBuilder()
              .setCustomId('change-division-team')
              .setPlaceholder('Select the team to move')
              .addOptions(
                teams.map(team => ({
                  label: team.name.slice(0, 100),
                  value: team.roleId,
                }))
              );

            return interaction.editReply({
              content:
                `Current division: **${currentDivision.name}**\n` +
                'Now select the team you want to move:',
              components: [
                new ActionRowBuilder().addComponents(teamMenu),
              ],
            });
          }

          // Step 2: Select the team and choose its destination.
          if (i.customId === 'change-division-team') {
            selectedTeamRoleId = i.values[0];

            const team = await Teams.findOne({
              roleId: selectedTeamRoleId,
              division: currentDivisionName,
            });

            if (!team) {
              collector.stop('error');

              return interaction.editReply({
                content: 'This team no longer exists in that division.',
                components: [],
              });
            }

            const targetDivisions = await Divisions.find({
              name: { $ne: currentDivisionName },
            }).sort({ name: 1 });

            if (!targetDivisions.length) {
              collector.stop('error');

              return interaction.editReply({
                content: 'There are no other divisions available.',
                components: [],
              });
            }

            const targetMenu = new StringSelectMenuBuilder()
              .setCustomId('change-division-target')
              .setPlaceholder('Select the new division')
              .addOptions(
                targetDivisions.map(division => ({
                  label: division.name.slice(0, 100),
                  value: division.name,
                }))
              );

            return interaction.editReply({
              content:
                `Team: **${team.emoji || ''} ${team.name}**\n` +
                `Current division: **${team.division}**\n\n` +
                'Select the new division for this team:',
              components: [
                new ActionRowBuilder().addComponents(targetMenu),
              ],
            });
          }

          // Step 3: Update only the team's division.
          if (i.customId === 'change-division-target') {
            const targetDivisionName = i.values[0];

            const [team, targetDivision] = await Promise.all([
              Teams.findOne({
                roleId: selectedTeamRoleId,
                division: currentDivisionName,
              }),
              Divisions.findOne({
                name: targetDivisionName,
              }),
            ]);

            if (!team) {
              collector.stop('error');

              return interaction.editReply({
                content: 'This team no longer exists in its original division.',
                components: [],
              });
            }

            if (!targetDivision) {
              collector.stop('error');

              return interaction.editReply({
                content: 'The selected destination division no longer exists.',
                components: [],
              });
            }

            if (targetDivision.name === team.division) {
              collector.stop('error');

              return interaction.editReply({
                content: 'The team is already in that division.',
                components: [],
              });
            }

            const oldDivisionName = team.division;
            const newDivisionName = targetDivision.name;

            // Only update the division field.
            // Existing player roles, staff roles, and staff records stay untouched.
            const result = await Teams.updateOne(
              {
                _id: team._id,
                division: oldDivisionName,
              },
              {
                $set: { division: newDivisionName },
              }
            );

            if (result.modifiedCount !== 1) {
              collector.stop('error');

              return interaction.editReply({
                content:
                  'The team could not be moved. Its division may have changed. Please try again.',
                components: [],
              });
            }

            const guild = interaction.guild;

            // Log the division change.
            const embed = new EmbedBuilder()
              .setColor('#3498db')
              .setAuthor({
                name: guild.name,
                iconURL: guild.iconURL({ size: 256 }) || undefined,
              })
              .setTitle('Team Division Changed')
              .addFields(
                {
                  name: 'Team',
                  value: `${team.emoji || ''} <@&${team.roleId}>`,
                  inline: false,
                },
                {
                  name: 'Previous Division',
                  value: `**${oldDivisionName}**`,
                  inline: true,
                },
                {
                  name: 'New Division',
                  value: `**${newDivisionName}**`,
                  inline: true,
                },
                {
                  name: 'Changed By',
                  value: `<@${interaction.user.id}>`,
                  inline: false,
                },
                {
                  name: 'Players and Staff',
                  value: 'All existing roles and staff records were preserved.',
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

            return interaction.editReply({
              content:
                `Successfully moved ${team.emoji || ''} **${team.name}** ` +
                `from **${oldDivisionName}** to **${newDivisionName}**.\n\n` +
                'All player roles, staff roles, and staff records remain unchanged.',
              components: [],
              allowedMentions: { parse: [] },
            });
          }
        } catch (error) {
          console.error('Error in /changedivision:', error);

          collector.stop('error');

          await interaction.editReply({
            content:
              "An error occurred while changing the team's division. Check the bot console.",
            components: [],
          }).catch(() => {});
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'completed' || reason === 'error') return;

        if (reason === 'time' || collected.size === 0) {
          await interaction.editReply({
            content: 'No selection made in time. Command cancelled.',
            components: [],
          }).catch(() => {});
        }
      });
    } catch (error) {
      console.error('Failed to start /changedivision:', error);

      collector?.stop('error');

      await interaction.editReply({
        content:
          'Something went wrong loading the divisions. Check the bot console.',
        components: [],
      }).catch(() => {});
    }
  },
};
