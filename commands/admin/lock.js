const { SlashCommandBuilder, MessageFlags, PermissionsBitField } = require('discord.js');
const { hasModPermission } = require('../../utils/modPermissions');
const { logModerationAction } = require('../../utils/moderationLogger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock the current channel for @everyone.')
    .setDefaultMemberPermissions(null),

  async execute(interaction) {
    if (!interaction.guild || !interaction.channel) {
      return interaction.reply({
        content: 'This command can only be used in a server channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!await hasModPermission(interaction)) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.channel;
    if (!channel.permissionOverwrites?.edit) {
      return interaction.reply({
        content: 'This channel does not support permission changes.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember || !channel.permissionsFor(botMember)?.has(PermissionsBitField.Flags.ManageRoles)) {
      return interaction.reply({
        content: 'I need the Manage Roles permission in this channel to change its permissions.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await channel.permissionOverwrites.edit(
        interaction.guild.id,
        {
          SendMessages: false,
          SendMessagesInThreads: false,
        },
        { reason: `Channel locked by ${interaction.user.tag}` },
      );

      await logModerationAction({
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        action: 'Lock',
        reason: `Channel locked`,
        details: `Channel: <#${channel.id}> • @everyone cannot send messages`,
        channelId: channel.id,
      });

      return interaction.reply({
        content: ` <#${channel.id}> has been locked for @everyone.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('lock command error:', error);
      return interaction.reply({
        content: 'I could not change this channel’s permissions. Check my Manage Roles permission and role position.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
