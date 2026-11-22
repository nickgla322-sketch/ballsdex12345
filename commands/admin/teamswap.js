const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { ADD_TEAM_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');
const Divisions = require('../../models/divisions');
const Teams = require('../../models/teams');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('teamswap')
    .setDescription('Swap two teams between different divisions'),

  async execute(interaction, client) {
    const allowedRoles = (
      Array.isArray(ADD_TEAM_ROLE) ? ADD_TEAM_ROLE : [ADD_TEAM_ROLE]
    ).filter(Boolean);

    if (!allowedRoles.some(roleId => interaction.member.roles.cache.has(roleId))) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let collector;

    try {
      const divisions = await Divisions.find().sort({ name: 1 });

      if (divisions.length < 2) {
        return interaction.editReply('At least two divisions must exist to swap teams.');
      }

      if (divisions.length > 25) {
        return interaction.editReply('There are too many divisions to display. The maximum is 25.');
      }

      const selected = {
        firstDivision: null,
        firstTeam: null,
        secondDivision: null,
        secondTeam: null,
      };

      const makeDivisionMenu = (customId, placeholder, options) =>
        new StringSelectMenuBuilder()
          .setCustomId(customId)
          .setPlaceholder(placeholder)
          .addOptions(options.slice(0, 25).map(division => ({
            label: division.name.slice(0, 100),
            value: division.name,
          })));

      const makeTeamMenu = (customId, placeholder, teams) =>
        new StringSelectMenuBuilder()
          .setCustomId(customId)
          .setPlaceholder(placeholder)
          .addOptions(teams.slice(0, 25).map(team => ({
            label: team.name.slice(0, 100),
            value: team.roleId,
          })));

      const firstDivisionMenu = makeDivisionMenu(
        'teamswap-first-division',
        'Select the first team\'s division',
        divisions
      );

      await interaction.editReply({
        content: 'Select the division containing the first team:',
        components: [new ActionRowBuilder().addComponents(firstDivisionMenu)],
      });

      const response = await interaction.fetchReply();
      collector = response.createMessageComponentCollector({
        filter: i =>
          i.user.id === interaction.user.id &&
          [
            'teamswap-first-division',
            'teamswap-first-team',
            'teamswap-second-division',
            'teamswap-second-team',
            'teamswap-confirm',
            'teamswap-cancel',
          ].includes(i.customId),
        time: 120_000,
      });

      collector.on('collect', async i => {
        try {
          await i.deferUpdate();

          if (i.customId === 'teamswap-first-division') {
            selected.firstDivision = i.values[0];
            const teams = await Teams.find({ division: selected.firstDivision }).sort({ name: 1 });

            if (!teams.length) {
              collector.stop('error');
              return interaction.editReply({
                content: `There are no teams in **${selected.firstDivision}**.`,
                components: [],
              });
            }
            if (teams.length > 25) {
              collector.stop('error');
              return interaction.editReply({
                content: `**${selected.firstDivision}** has more than 25 teams; please reduce the list before using this command.`,
                components: [],
              });
            }

            return interaction.editReply({
              content: `First division: **${selected.firstDivision}**\nSelect the first team:`,
              components: [new ActionRowBuilder().addComponents(
                makeTeamMenu('teamswap-first-team', 'Select the first team', teams)
              )],
            });
          }

          if (i.customId === 'teamswap-first-team') {
            selected.firstTeam = await Teams.findOne({
              roleId: i.values[0],
              division: selected.firstDivision,
            });

            if (!selected.firstTeam) {
              collector.stop('error');
              return interaction.editReply({ content: 'The first team could not be found. Please try again.', components: [] });
            }

            const otherDivisions = divisions.filter(d => d.name !== selected.firstDivision);
            return interaction.editReply({
              content:
                `First team: ${selected.firstTeam.emoji || ''} **${selected.firstTeam.name}**\n` +
                `Current division: **${selected.firstDivision}**\n\nSelect the other division:`,
              components: [new ActionRowBuilder().addComponents(
                makeDivisionMenu('teamswap-second-division', 'Select the second team\'s division', otherDivisions)
              )],
            });
          }

          if (i.customId === 'teamswap-second-division') {
            selected.secondDivision = i.values[0];
            const teams = await Teams.find({ division: selected.secondDivision }).sort({ name: 1 });

            if (!teams.length) {
              collector.stop('error');
              return interaction.editReply({
                content: `There are no teams in **${selected.secondDivision}**.`,
                components: [],
              });
            }
            if (teams.length > 25) {
              collector.stop('error');
              return interaction.editReply({
                content: `**${selected.secondDivision}** has more than 25 teams; please reduce the list before using this command.`,
                components: [],
              });
            }

            return interaction.editReply({
              content: `Second division: **${selected.secondDivision}**\nSelect the second team:`,
              components: [new ActionRowBuilder().addComponents(
                makeTeamMenu('teamswap-second-team', 'Select the second team', teams)
              )],
            });
          }

          if (i.customId === 'teamswap-second-team') {
            selected.secondTeam = await Teams.findOne({
              roleId: i.values[0],
              division: selected.secondDivision,
            });

            if (!selected.secondTeam) {
              collector.stop('error');
              return interaction.editReply({ content: 'The second team could not be found. Please try again.', components: [] });
            }

            if (selected.firstTeam.roleId === selected.secondTeam.roleId) {
              collector.stop('error');
              return interaction.editReply({ content: 'You must select two different teams.', components: [] });
            }

            const confirmRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('teamswap-confirm')
                .setLabel('Confirm swap')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId('teamswap-cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
            );

            return interaction.editReply({
              content:
                '**Review team swap**\n\n' +
                `${selected.firstTeam.emoji || ''} **${selected.firstTeam.name}**\n` +
                `From: **${selected.firstDivision}** → **${selected.secondDivision}**\n\n` +
                `${selected.secondTeam.emoji || ''} **${selected.secondTeam.name}**\n` +
                `From: **${selected.secondDivision}** → **${selected.firstDivision}**\n\n` +
                'Only the division assignments will change. Team names, emojis, player counts, player roles, and staff records will be preserved. Confirm?',
              components: [confirmRow],
              allowedMentions: { parse: [] },
            });
          }

          if (i.customId === 'teamswap-cancel') {
            collector.stop('cancelled');
            return interaction.editReply({ content: 'Team swap cancelled.', components: [] });
          }

          if (i.customId === 'teamswap-confirm') {
            // Re-read both records to avoid overwriting a team that was moved or edited
            // while the administrator was making selections.
            const [firstTeam, secondTeam] = await Promise.all([
              Teams.findOne({ _id: selected.firstTeam._id, roleId: selected.firstTeam.roleId, division: selected.firstDivision }),
              Teams.findOne({ _id: selected.secondTeam._id, roleId: selected.secondTeam.roleId, division: selected.secondDivision }),
            ]);

            if (!firstTeam || !secondTeam) {
              collector.stop('error');
              return interaction.editReply({
                content: 'One or both teams changed while you were selecting. Nothing was swapped; please run /teamswap again.',
                components: [],
              });
            }

            // Update only the division field on each existing team document.
            const result = await Teams.bulkWrite([
              {
                updateOne: {
                  filter: { _id: firstTeam._id, division: selected.firstDivision },
                  update: { $set: { division: selected.secondDivision } },
                },
              },
              {
                updateOne: {
                  filter: { _id: secondTeam._id, division: selected.secondDivision },
                  update: { $set: { division: selected.firstDivision } },
                },
              },
            ]);

            if (result.matchedCount !== 2 || result.modifiedCount !== 2) {
              collector.stop('error');
              return interaction.editReply({
                content: 'The swap could not be completed safely. Please check both teams and try again.',
                components: [],
              });
            }

            const guild = interaction.guild;
            const embed = new EmbedBuilder()
              .setColor('#3498db')
              .setAuthor({
                name: guild.name,
                iconURL: guild.iconURL({ size: 256 }) || undefined,
              })
              .setTitle('Teams Swapped Between Divisions')
              .addFields(
                {
                  name: firstTeam.name,
                  value: `${firstTeam.emoji || ''} <@&${firstTeam.roleId}>\n**${selected.firstDivision}** → **${selected.secondDivision}**`,
                  inline: true,
                },
                {
                  name: secondTeam.name,
                  value: `${secondTeam.emoji || ''} <@&${secondTeam.roleId}>\n**${selected.secondDivision}** → **${selected.firstDivision}**`,
                  inline: true,
                },
                {
                  name: 'Changed By',
                  value: `<@${interaction.user.id}>`,
                  inline: false,
                },
                {
                  name: 'Preserved Data',
                  value: 'Team names, emojis, player counts, player roles, and staff records were not changed.',
                  inline: false,
                }
              )
              .setTimestamp();

            await logAction(client, { embeds: [embed], allowedMentions: { parse: [] } });

            collector.stop('completed');
            return interaction.editReply({
              content:
                `Successfully swapped **${firstTeam.name}** and **${secondTeam.name}**.\n\n` +
                `• **${firstTeam.name}** is now in **${selected.secondDivision}**.\n` +
                `• **${secondTeam.name}** is now in **${selected.firstDivision}**.\n\n` +
                'All team names, emojis, player counts, player roles, and staff records remain unchanged.',
              components: [],
              allowedMentions: { parse: [] },
            });
          }
        } catch (error) {
          console.error('Error in /teamswap:', error);
          collector.stop('error');
          await interaction.editReply({
            content: 'An error occurred while swapping teams. Check the bot console.',
            components: [],
          }).catch(() => {});
        }
      });

      collector.on('end', async (collected, reason) => {
        if (['completed', 'error', 'cancelled'].includes(reason)) return;
        if (reason === 'time') {
          await interaction.editReply({
            content: 'No selection made in time. Team swap cancelled.',
            components: [],
          }).catch(() => {});
        }
      });
    } catch (error) {
      console.error('Failed to start /teamswap:', error);
      collector?.stop('error');
      await interaction.editReply({
        content: 'Something went wrong loading the divisions. Check the bot console.',
        components: [],
      }).catch(() => {});
    }
  },
};
