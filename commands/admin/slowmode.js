const { SlashCommandBuilder, MessageFlags, PermissionsBitField } = require('discord.js');

const ALLOWED_ROLE_IDS = [
  '1561183666976202832',
  '1374495087509114901',
  '1374495092521566260',
  '1374495097961578656',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set the slowmode cooldown for a channel.')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel whose slowmode you want to change.')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('seconds')
        .setDescription('Slowmode cooldown in seconds (0 disables slowmode).')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true))
    .setDefaultMemberPermissions(null),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member || !member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id))) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.options.getChannel('channel', true);
    const seconds = interaction.options.getInteger('seconds', true);

    if (typeof channel.setRateLimitPerUser !== 'function') {
      return interaction.reply({
        content: 'That channel does not support slowmode.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember || !channel.permissionsFor(botMember)?.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({
        content: 'I need the Manage Channels permission in that channel to change its slowmode.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await channel.setRateLimitPerUser(
        seconds,
        `Slowmode changed by ${interaction.user.tag}`,
      );

      const setting = seconds === 0
        ? 'Slowmode has been disabled.'
        : `Slowmode is now **${seconds} seconds**.`;

      return interaction.reply({
        content: `Updated slowmode for <#${channel.id}>. ${setting}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Slowmode command error:', error);
      return interaction.reply({
        content: 'I could not update slowmode. Check my channel permissions and try again.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
