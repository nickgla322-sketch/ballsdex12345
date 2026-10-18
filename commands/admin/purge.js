
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete multiple messages from this channel.')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('How many messages to delete (1-100).')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    ),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');

    if (!interaction.channel ||
        !interaction.channel.isTextBased() ||
        !interaction.channel.messages) {
      return interaction.reply({
        content: 'This command can only be used in a text channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const deleted = await interaction.channel.bulkDelete(
        amount,
        true
      );

      return interaction.reply({
        content: `Successfully deleted **${deleted.size}** message(s).`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Purge command error:', error);

      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({
          content: 'Failed to delete messages. Check my permissions.',
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        content: 'Failed to delete messages. Check my permissions.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
