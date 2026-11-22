
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { REMOVE_DIVISION_ROLE, ASSISTANT_MANAGER_ROLE, MANAGER_ROLE, CHAIRMAN_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

const Divisions = require('../../models/divisions');
const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');

const FREE_AGENT_ROLE_ID = '1374495332846669956';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeName(str) {
  return str
    .normalize('NFKD')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getEmojiImageUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);

  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

function limitField(text, maxLength = 1024) {
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 25)}\n...list shortened.`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removedivision')
    .setDescription('Remove a division and its teams'),

  async execute(interaction, client) {
    const allowedRoles = Array.isArray(REMOVE_DIVISION_ROLE)
      ? REMOVE_DIVISION_ROLE
      : [REMOVE_DIVISION_ROLE];

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
          'There are no divisions to remove.'
        );
      }

      if (divisions.length > 25) {
        return interaction.editReply(
          'There are too many divisions to display. The maximum is 25.'
        );
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId('remove-division-select')
        .setPlaceholder('Select a division to remove')
.addOptions(
  divisions.map(division => ({
    label: `${division.emoji || ''} ${division.name}`
      .trim()
      .slice(0, 100),
    value: division.name,
  }))
);
      await interaction.editReply({
        content: 'Choose the division you want to remove:',
        components: [
          new ActionRowBuilder().addComponents(menu),
        ],
      });

      const response = await interaction.fetchReply();

      const collector = response.createMessageComponentCollector({
        filter: i =>
          i.customId === 'remove-division-select' &&
          i.user.id === interaction.user.id,
        time: 60_000,
        max: 1,
      });

      collector.on('collect', async i => {
        try {
          await i.deferUpdate();

          const rawName = i.values[0];
          const normalizedName = normalizeName(rawName);
          const safeName = escapeRegex(normalizedName);
          const nameRegex = new RegExp(`^${safeName}$`, 'i');

          const division = await Divisions.findOne({
            name: { $regex: nameRegex },
          });

          if (!division) {
            return interaction.editReply({
              content: `Division **${rawName}** no longer exists.`,
              components: [],
            });
          }

          // Load all teams before deleting the division.
          const teamsInDivision = await Teams.find({
            division: division.name,
          });

          const removedTeams = teamsInDivision.length;
          const staffEntries = await Staffs.find({ teamRoleId: { $in: teamsInDivision.map(team => team.roleId) } });
          const guild = interaction.guild;

          const removedPlayers = new Set();
          const failedRoleRemovals = new Set();
          const freeAgentErrors = new Set();
          const staffRoleErrors = new Set();
          const staffRoleByPosition = { assistant: ASSISTANT_MANAGER_ROLE, manager: MANAGER_ROLE, chairman: CHAIRMAN_ROLE };

          // Fetch all server members before changing roles or deleting records.
          let members;

          try {
            members = await guild.members.fetch();
          } catch (error) {
            console.error('Failed to fetch guild members:', error);

            return interaction.editReply({
              content:
                'Could not load all server members. The division and teams were not deleted. Try again later.',
              components: [],
            });
          }

          // Find the team roles that still exist in the server.
          const teamRoles = teamsInDivision
            .map(team => ({
              team,
              role: guild.roles.cache.get(team.roleId),
            }))
            .filter(entry => entry.role);

          // Remove division team roles and give Free Agent to affected members.
          for (const member of members.values()) {
            const memberTeamRoles = teamRoles.filter(({ team }) =>
              member.roles.cache.has(team.roleId)
            );

            if (!memberTeamRoles.length) continue;

            let allTeamRolesRemoved = true;

            for (const { team } of memberTeamRoles) {
              try {
                await member.roles.remove(
                  team.roleId,
                  `Removing division ${division.name} and its teams`
                );
              } catch (error) {
                console.error(
                  `Failed to remove team role ${team.roleId} from ${member.user.tag}:`,
                  error
                );

                failedRoleRemovals.add(member.id);
                allTeamRolesRemoved = false;
              }
            }

            // Only add Free Agent if all of this member's roles
            // from the deleted division were successfully removed.
            if (allTeamRolesRemoved) {
              try {
                if (!member.roles.cache.has(FREE_AGENT_ROLE_ID)) {
                  await member.roles.add(
                    FREE_AGENT_ROLE_ID,
                    `Division ${division.name} was removed`
                  );
                }

                removedPlayers.add(member.id);
              } catch (error) {
                console.error(
                  `Failed to add Free Agent role to ${member.user.tag}:`,
                  error
                );

                freeAgentErrors.add(member.id);
                removedPlayers.add(member.id);
              }
            }
          }

          // Remove staff hierarchy roles only when the member no longer
          // has that position on another team.
          for (const staff of staffEntries) {
            const roleId = staffRoleByPosition[staff.position];
            if (!roleId) continue;
            const stillHoldsPosition = await Staffs.exists({
              userId: staff.userId,
              position: staff.position,
              teamRoleId: { $nin: teamsInDivision.map(team => team.roleId) },
            });
            if (stillHoldsPosition) continue;
            const member = members.get(staff.userId);
            if (!member) {
              staffRoleErrors.add(staff.userId);
              continue;
            }
            if (member.roles.cache.has(roleId)) {
              try {
                await member.roles.remove(roleId, `Division ${division.name} was removed`);
              } catch (error) {
                console.error('Failed to remove staff hierarchy role:', error);
                staffRoleErrors.add(staff.userId);
              }
            }
          }

          // Never delete records while any role transition is incomplete.
          if (failedRoleRemovals.size || freeAgentErrors.size || staffRoleErrors.size) {
            return interaction.editReply({
              content:
                `Division cleanup was incomplete. The division, teams, and staff records were retained. Team role errors: ${failedRoleRemovals.size}; Free Agent errors: ${freeAgentErrors.size}; staff role errors: ${staffRoleErrors.size}. Fix the role permissions/member access and retry.`,
              components: [],
            });
          }

          await Staffs.deleteMany({ teamRoleId: { $in: teamsInDivision.map(team => team.roleId) } });
          await Divisions.deleteOne({ _id: division._id });
          await Teams.deleteMany({ division: division.name });

          const teamList = removedTeams
            ? teamsInDivision
                .map(team => `• ${team.emoji || ''} **${team.name}**`)
                .join('\n')
            : '*No teams were inside this division.*';

          const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setAuthor({
              name: guild.name,
              iconURL: guild.iconURL({ size: 256 }) || undefined,
            })
            .setTitle('Division Removed')
            .addFields(
              {
                name: 'Division',
                value: `${division.emoji || ''} **${division.name}**`,
                inline: false,
              },
              {
                name: 'Teams Removed',
                value: String(removedTeams),
                inline: true,
              },
              {
                name: 'Players Given Free Agent',
                value: String(
                  removedPlayers.size - freeAgentErrors.size
                ),
                inline: true,
              },
              {
                name: 'Team Role Removal Errors',
                value: String(failedRoleRemovals.size),
                inline: true,
              },
              {
                name: 'Free Agent Role Errors',
                value: String(freeAgentErrors.size),
                inline: true,
              },
              {
                name: 'Removed By',
                value: `<@${interaction.user.id}>`,
                inline: false,
              },
              {
                name: 'Teams Affected',
                value: limitField(teamList),
                inline: false,
              }
            )
            .setTimestamp();

          const thumbnail = getEmojiImageUrl(division.emoji);

          if (thumbnail) {
            embed.setThumbnail(thumbnail);
          }

          await logAction(client, {
            embeds: [embed],
            allowedMentions: { parse: [] },
          });

          await interaction.editReply({
            content:
              `Division **${division.emoji || ''} ${division.name}** has been removed.\n` +
              `Removed **${removedTeams}** teams.\n` +
              `Processed **${removedPlayers.size}** affected players.\n` +
              `Free Agent role errors: **${freeAgentErrors.size}**.\n` +
              `Team role removal errors: **${failedRoleRemovals.size}**.\n` +
              `Removed by <@${interaction.user.id}>.`,
            allowedMentions: { parse: [] },
            components: [],
          });
        } catch (error) {
          console.error('Remove division selection failed:', error);

          await interaction.editReply({
            content:
              'Something went wrong while removing the division. Check the bot console.',
            components: [],
          }).catch(() => {});
        }
      });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: 'No division selected. Command cancelled.',
            components: [],
          }).catch(() => {});
        }
      });
    } catch (error) {
      console.error('Remove division command failed:', error);

      await interaction.editReply(
        'Something went wrong loading the divisions. Check the bot console.'
      ).catch(() => {});
    }
  },
};
