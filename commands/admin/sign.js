
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

const Staffs = require('../../models/staffs');
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

    try {
      await member.roles.add(
        team.roleId,
        `Signed by ${interaction.user.tag}`
      );
    } catch (error) {
      console.error('Error assigning team role:', error);

      return interaction.reply({
        content: 'The player could not be signed. Check the bot role permissions.',
        flags: MessageFlags.Ephemeral,
      });
    }

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
      content: `<@${player.id}> has been signed to **${team.name}**.`,
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
            content: 'You could not be found in the server. Please contact a server administrator.',
          });

          return;
        }

        // Remove the team role.
        if (currentMember.roles.cache.has(team.roleId)) {
          await currentMember.roles.remove(
            team.roleId,
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
          content: `Your signing to **${team.name}** has been revoked.`,
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
            content: 'An error occurred while processing your report. Please contact a server administrator.',
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
