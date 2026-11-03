
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require('discord.js');

const { SIGN_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');
const getGuildMembers = require('../../utils/getGuildMembers');

const Staffs = require('../../models/staffs');
const Teams = require('../../models/teams');

const FREE_AGENT_ROLE_ID = '1374495332846669956';
const ROSTER_MAX = 14;
const activeSignings = new Set();

function getTeamLogoUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);

  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sign')
    .setDescription('Sign a player to your team')
    .addUserOption(opt =>
      opt
        .setName('player')
        .setDescription('Player to sign')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const allowedRoles = (
      Array.isArray(SIGN_ROLE) ? SIGN_ROLE : [SIGN_ROLE]
    ).filter(Boolean);

    if (
      allowedRoles.length === 0 ||
      !allowedRoles.some(roleId =>
        interaction.member.roles.cache.has(roleId)
      )
    ) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const staffEntry = await Staffs.findOne({
      userId: interaction.user.id,
    });

    if (!staffEntry) {
      return interaction.reply({
        content: 'You are not assigned to any team.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const team = await Teams.findOne({
      roleId: staffEntry.teamRoleId,
    });

    if (!team) {
      return interaction.reply({
        content: 'Your team no longer exists.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const player = interaction.options.getUser('player');

    if (player.id === interaction.user.id) {
      return interaction.reply({
        content: 'You cannot sign yourself.',
        flags: MessageFlags.Ephemeral,
      });
    }

    let member;

    try {
      member = await interaction.guild.members.fetch(player.id);
    } catch {
      return interaction.reply({
        content: 'This player could not be found in the server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const allTeams = await Teams.find();

    const alreadyOnTeam = allTeams.find(t =>
      member.roles.cache.has(t.roleId)
    );

    if (alreadyOnTeam) {
      return interaction.reply({
        content: `<@${player.id}> is already on **${alreadyOnTeam.name}**.`,
        allowedMentions: { parse: [] },
        flags: MessageFlags.Ephemeral,
      });
    }

    // Prevent simultaneous sign requests from exceeding the roster limit.
    if (activeSignings.has(team.roleId)) {
      return interaction.reply({
        content: 'A signing for your team is already being processed. Please try again in a moment.',
        flags: MessageFlags.Ephemeral,
      });
    }

    activeSignings.add(team.roleId);

    try {
      await getGuildMembers(interaction.guild);

      const teamRole = await interaction.guild.roles.fetch(team.roleId);
      const currentRoster = teamRole?.members.size ?? 0;

      if (currentRoster >= ROSTER_MAX) {
        return interaction.reply({
          content:
            'You have reached the roster maximum. You must release players if you want to sign any more.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Successful signing: add team role and remove Free Agent role.
      try {
        await member.roles.add(
          team.roleId,
          `Signed by ${interaction.user.tag}`
        );

        if (member.roles.cache.has(FREE_AGENT_ROLE_ID)) {
          await member.roles.remove(
            FREE_AGENT_ROLE_ID,
            `Signed to ${team.name} by ${interaction.user.tag}`
          );
        }
      } catch (error) {
        console.error('Error updating player roles:', error);

        // If removing Free Agent fails after the team role was added,
        // attempt to undo the team role assignment.
        await member.roles.remove(
          team.roleId,
          'Rolling back incomplete signing'
        ).catch(() => {});

        return interaction.reply({
          content:
            'The player could not be signed correctly. Check the bot role permissions and role hierarchy.',
          flags: MessageFlags.Ephemeral,
        });
      }
    } finally {
      activeSignings.delete(team.roleId);
    }

    const rosterCount = interaction.guild.roles.cache.get(team.roleId)?.members.size ?? 0;

    const guild = interaction.guild;
    const teamLogoUrl = getTeamLogoUrl(team.emoji);

    const logEmbed = new EmbedBuilder()
      .setColor('#00AEEF')
      .setAuthor({
        name: guild.name,
        iconURL: guild.iconURL({ size: 256 }) || undefined,
      })
      .setTitle('Player Signed')
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
          name: 'Signed Player',
          value: `<@${player.id}>`,
          inline: false,
        },
        {
          name: 'Signed By',
          value: `<@${interaction.user.id}>`,
          inline: false,
        }
      )
      .setTimestamp();

    if (teamLogoUrl) {
      logEmbed.setThumbnail(teamLogoUrl);
    }

    await logAction(client, {
      embeds: [logEmbed],
      allowedMentions: { parse: [] },
    });

    await interaction.reply({
      content: `<@${player.id}> has been signed to **${team.name}**.\\nRoster is now **${rosterCount}/${ROSTER_MAX}**.`,
      allowedMentions: { parse: [] },
    });

    const dmEmbed = new EmbedBuilder()
      .setColor('#00AEEF')
      .setAuthor({
        name: 'Team Notification',
        iconURL: guild.iconURL({ size: 256 }) || undefined,
      })
      .setTitle('You Have Been Signed!')
      .setDescription(
        `You have been signed to ${team.emoji || ''} **${team.name}** ` +
        `in the **${guild.name}** server.`
      )
      .setTimestamp();

    if (teamLogoUrl) {
      dmEmbed.setThumbnail(teamLogoUrl);
    }

    const forceBtn = new ButtonBuilder()
      .setCustomId(`force_sign_${team.roleId}_${Date.now()}`)
      .setLabel('I Was Forced to Sign for This Team')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(forceBtn);

    let dmMessage;

    try {
      dmMessage = await player.send({
        embeds: [dmEmbed],
        components: [row],
      });
    } catch {
      // The player may have DMs disabled.
    }

    if (!dmMessage) return;

    const collector = dmMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 24 * 60 * 60 * 1000,
    });

    collector.on('collect', async btnInteraction => {
      if (btnInteraction.user.id !== player.id) {
        return btnInteraction.reply({
          content: 'This button is not for you.',
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        await btnInteraction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        const currentMember = await interaction.guild.members
          .fetch(player.id)
          .catch(() => null);

        if (!currentMember) {
          await btnInteraction.editReply({
            content:
              'You could not be found in the server. Please contact a server administrator.',
          });

          return;
        }

        // Force signing: remove team role and add Free Agent role.
        if (currentMember.roles.cache.has(team.roleId)) {
          await currentMember.roles.remove(
            team.roleId,
            'Player reported a forced signing'
          );
        }

        if (!currentMember.roles.cache.has(FREE_AGENT_ROLE_ID)) {
          await currentMember.roles.add(
            FREE_AGENT_ROLE_ID,
            'Player reported a forced signing'
          );
        }

        const forcedEmbed = new EmbedBuilder()
          .setColor('#e74c3c')
          .setAuthor({
            name: guild.name,
            iconURL: guild.iconURL({ size: 256 }) || undefined,
          })
          .setTitle('Forced Signing Reported')
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
              name: 'Player Removed',
              value: `<@${player.id}>`,
              inline: false,
            },
            {
              name: 'Originally Signed By',
              value: `<@${interaction.user.id}>`,
              inline: false,
            },
            {
              name: 'Reason',
              value: 'Player reported a forced signing.',
              inline: false,
            }
          )
          .setTimestamp();

        if (teamLogoUrl) {
          forcedEmbed.setThumbnail(teamLogoUrl);
        }

        await logAction(client, {
          embeds: [forcedEmbed],
          allowedMentions: { parse: [] },
        });

        await btnInteraction.editReply({
          content:
            `Your signing to **${team.name}** has been revoked. ` +
            'You have been given the Free Agent role.',
        });

        const disabledRow = new ActionRowBuilder().addComponents(
          ButtonBuilder.from(forceBtn).setDisabled(true)
        );

        await dmMessage.edit({
          components: [disabledRow],
        });

        collector.stop('reported');
      } catch (error) {
        console.error('Error handling forced signing report:', error);

        if (btnInteraction.deferred || btnInteraction.replied) {
          await btnInteraction.editReply({
            content:
              'An error occurred while processing your report. Please contact a server administrator.',
          }).catch(() => {});
        } else {
          await btnInteraction.reply({
            content: 'An error occurred while processing your report.',
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }
      }
    });

    collector.on('end', async () => {
      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(forceBtn).setDisabled(true)
      );

      await dmMessage.edit({
        components: [disabledRow],
      }).catch(() => {});
    });
  },
};
