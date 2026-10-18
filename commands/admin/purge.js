
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
    const channel = interaction.channel;

    if (
      !channel ||
      !channel.isTextBased() ||
      !channel.messages
    ) {
      return interaction.reply({
        content: 'This command can only be used in a text channel.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const messages = await channel.messages.fetch({
        limit: amount,
      });

      let deletedCount = 0;
      const oldMessages = messages.filter(
        message =>
          Date.now() - message.createdTimestamp >=
          14 * 24 * 60 * 60 * 1000
      );

      const recentMessages = messages.filter(
        message =>
          Date.now() - message.createdTimestamp <
          14 * 24 * 60 * 60 * 1000
      );

      // Bulk-delete newer messages.
      if (recentMessages.size > 0) {
        const deleted = await channel.bulkDelete(
          recentMessages,
          true
        );

        deletedCount += deleted.size;
      }

      // Delete older messages individually.
      for (const message of oldMessages.values()) {
        try {
          await message.delete();
          deletedCount++;
        } catch (error) {
          console.error(
            `Failed to delete message ${message.id}:`,
            error.message
          );
        }
      }

      return interaction.editReply({
        content: `Successfully deleted **${deletedCount}** of **${messages.size}** messages.`,
      });
    } catch (error) {
      console.error('Purge command error:', error);

      return interaction.editReply({
        content: 'Failed to purge messages. Check the bot permissions.',
      });
    }
  },
};
