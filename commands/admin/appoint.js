
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');

const {
  APPOINT_ROLE,
  ASSISTANT_MANAGER_ROLE,
  MANAGER_ROLE,
  CHAIRMAN_ROLE,
} = require('../../utils/permissions');

const { logAction } = require('../../utils/logger');
const { ROSTER_MAX, withRosterSlot } = require('../../utils/roster');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');
const Divisions = require('../../models/divisions');

const FREE_AGENT_ROLE_ID = '1374495332846669956';

function getValidSelectEmoji(value) {
  if (typeof value !== 'string') return undefined;
  const emoji = value.trim();
  if (!emoji) return undefined;

  // Discord custom emoji must include a valid name and snowflake ID.
  const custom = emoji.match(/^<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>$/);
  if (custom) {
    return { name: custom[2], id: custom[3], animated: custom[1] === 'a' };
  }

  // Accept Unicode emoji sequences, but never pass arbitrary database text
  // into Discord's component payload.
  if (/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u200D|\p{Emoji_Modifier}|\u20E3)+$/u.test(emoji)) {
    return { name: emoji };
  }

  return undefined;
}

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

function pretty(position) {
  switch (position) {
    case 'assistant':
      return 'Assistant Manager';
    case 'manager':
      return 'Manager';
    case 'chairman':
      return 'Chairman';
    default:
      return 'Unknown';
  }
}

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);

  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('appoint')
    .setDescription('Make a user a chairman, manager, or assistant manager!')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('User to appoint')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('position')
        .setDescription('Team position')
        .setRequired(true)
        .addChoices(
          { name: 'Chairman', value: 'chairman' },
          { name: 'Manager', value: 'manager' },
          { name: 'Assistant Manager', value: 'assistant' }
        )
    ),

  async execute(interaction, client) {
    const allowedRoles = Array.isArray(APPOINT_ROLE)
      ? APPOINT_ROLE
      : [APPOINT_ROLE];

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

    const user = interaction.options.getUser('user');
    const position = interaction.options.getString('position');

    try {
      // Load divisions
      const divisions = await Divisions.find().sort({ name: 1 });

      if (!divisions.length) {
        return interaction.reply({
          content: 'There are no divisions in the database.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (divisions.length > 25) {
        return interaction.reply({
          content:
            'There are too many divisions to display. The maximum is 25.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // First dropdown: select a division
      const divisionMenu = new StringSelectMenuBuilder()
        .setCustomId('appoint-division-select')
        .setPlaceholder('Select a division')
        .addOptions(
          divisions.map(division => ({
            label: division.name.slice(0, 100),
            value: division.name,
            ...(getValidSelectEmoji(division.emoji) ? { emoji: getValidSelectEmoji(division.emoji) } : {}),
          }))
        );

      await interaction.reply({
        content: 'Select the division containing the team:',
        components: [
          new ActionRowBuilder().addComponents(divisionMenu),
        ],
        flags: MessageFlags.Ephemeral,
      });

      const response = await interaction.fetchReply();

      const divisionCollector =
        response.createMessageComponentCollector({
          filter: i =>
            i.customId === 'appoint-division-select' &&
            i.user.id === interaction.user.id,
          time: 60000,
          max: 1,
        });

      divisionCollector.on('collect', async divisionInteraction => {
        try {
          await divisionInteraction.deferUpdate();

          const divisionName = divisionInteraction.values[0];

          // Load teams in the selected division
          const teams = await Teams.find({
            division: divisionName,
          }).sort({ name: 1 });

          if (!teams.length) {
            return interaction.editReply({
              content: `There are no teams in the division **${divisionName}**.`,
              components: [],
            });
          }

          if (teams.length > 25) {
            return interaction.editReply({
              content:
                `The division **${divisionName}** has too many teams to display. ` +
                'The maximum is 25.',
              components: [],
            });
          }

          // Second dropdown: select a team
          const teamMenu = new StringSelectMenuBuilder()
            .setCustomId('appoint-team-select')
            .setPlaceholder('Select a team')
            .addOptions(
              teams.map(team => ({
                label: team.name.slice(0, 100),
                value: team.roleId,
                ...(getValidSelectEmoji(team.emoji) ? { emoji: getValidSelectEmoji(team.emoji) } : {}),
              }))
            );

          await interaction.editReply({
            content:
              `Division: **${divisionName}**\n` +
              'Select the team you want to appoint this user to:',
            components: [
              new ActionRowBuilder().addComponents(teamMenu),
            ],
          });

          const teamCollector =
            response.createMessageComponentCollector({
              filter: i =>
                i.customId === 'appoint-team-select' &&
                i.user.id === interaction.user.id,
              time: 60000,
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
                  content: 'This team could not be found.',
                  components: [],
                });
              }

              // Fetch the user
              const member = await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

              if (!member) {
                return interaction.editReply({
                  content: 'That user is not a member of this server.',
                  components: [],
                });
              }

              // Check all teams across every division
              const allTeams = await Teams.find();

              const userTeam = allTeams.find(t =>
                member.roles.cache.has(t.roleId)
              );

              if (userTeam && userTeam.roleId !== team.roleId) {
                return interaction.editReply({
                  content:
                    `<@${user.id}> is already on <@&${userTeam.roleId}> ` +
                    `and cannot be appointed to <@&${team.roleId}>.`,
                  components: [],
                  allowedMentions: { parse: [] },
                });
              }

              // Check whether the position is already filled
              const existing = await Staffs.findOne({
                teamRoleId: team.roleId,
                position,
              });

              if (existing) {
                return interaction.editReply({
                  content:
                    `This team already has a **${pretty(position)}**. ` +
                    'Use /sack first.',
                  components: [],
                });
              }

              // Prevent appointing someone who is already staff elsewhere
              const alreadyStaff = await Staffs.findOne({
                userId: user.id,
              });

              if (alreadyStaff) {
                return interaction.editReply({
                  content:
                    `<@${user.id}> is already staff for ` +
                    `**${alreadyStaff.teamName}** as ` +
                    `**${pretty(alreadyStaff.position)}**.`,
                  components: [],
                  allowedMentions: { parse: [] },
                });
              }

              const staffRoleId = getStaffRoleId(position);

              if (!staffRoleId) {
                return interaction.editReply({
                  content: 'Invalid staff position.',
                  components: [],
                });
              }

              // Appointing a new person also adds them to the team roster.
              if (!member.roles.cache.has(team.roleId)) {
                const rosterResult = await withRosterSlot(
                  interaction.guild,
                  team.roleId,
                  async () => {
                    await member.roles.add(team.roleId);
                  }
                );

                if (!rosterResult.ok) {
                  return interaction.editReply({
                    content: rosterResult.full
                      ? `This team is full (**${rosterResult.count}/16**). Release a player before adding anyone else.`
                      : 'A roster change for this team is already being processed. Please try again in a moment.',
                    components: [],
                  });
                }
              }

              // Assign the staff hierarchy role
              await member.roles.add(staffRoleId);

              // Remove the Free Agent role if they have it
              if (member.roles.cache.has(FREE_AGENT_ROLE_ID)) {
                await member.roles.remove(FREE_AGENT_ROLE_ID);
              }

              // Save the staff record
              await Staffs.create({
                userId: user.id,
                teamRoleId: team.roleId,
                teamName: team.name,
                position,
              });

              const rosterCount =
                interaction.guild.roles.cache.get(team.roleId)?.members.size ?? 0;

              const guild = interaction.guild;

              // Build appointment log
              const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setAuthor({
                  name: guild.name,
                  iconURL: guild.iconURL({ size: 256 }) || undefined,
                })
                .setTitle('Staff Appointment')
                .addFields(
                  {
                    name: 'Division',
                    value: team.division || 'Unknown',
                    inline: false,
                  },
                  {
                    name: 'Team',
                    value: `${team.emoji || ''} <@&${team.roleId}>`,
                    inline: false,
                  },
                  {
                    name: 'Position',
                    value: `<@&${staffRoleId}> (${pretty(position)})`,
                    inline: false,
                  },
                  {
                    name: 'Appointed User',
                    value: `<@${user.id}>`,
                    inline: false,
                  },
                  {
                    name: 'Appointed By',
                    value: `<@${interaction.user.id}>`,
                    inline: false,
                  }
                )
                .setTimestamp();

              const teamLogoUrl = getTeamLogoUrl(team.emoji);

              if (teamLogoUrl) {
                embed.setThumbnail(teamLogoUrl);
              }

              await logAction(client, {
                embeds: [embed],
                allowedMentions: { parse: [] },
              });

              await interaction.editReply({
                content:
                  `<@${user.id}> has been appointed as **${pretty(position)}** ` +
                  `of ${team.emoji || ''} <@&${team.roleId}> in the division ` +
                  `**${team.division || divisionName}**.\nRoster is now **${rosterCount}/${ROSTER_MAX}**.`,
                components: [],
                allowedMentions: { parse: [] },
              });
            } catch (error) {
              console.error('Appointment team selection failed:', error);

              await interaction.editReply({
                content:
                  'Something went wrong appointing this user. ' +
                  'Check the bot console for details.',
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
          console.error('Appointment division selection failed:', error);

          await interaction.editReply({
            content:
              'Something went wrong loading the teams. ' +
              'Check the bot console for details.',
            components: [],
          }).catch(() => {});
        }
      });

      divisionCollector.on('end', async collected => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: 'No division selected. Command cancelled.',
            components: [],
          }).catch(() => {});
        }
      });
    } catch (error) {
      console.error('Appoint command failed:', error);

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
          content:
            'Something went wrong loading the divisions. ' +
            'Check the bot console for details.',
          components: [],
        }).catch(() => {});
      } else {
        await interaction.reply({
          content:
            'Something went wrong loading the divisions. ' +
            'Check the bot console for details.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  },
};
