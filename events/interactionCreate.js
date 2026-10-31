
module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isStringSelectMenu() &&
      !interaction.isButton()
    ) {
      return;
    }

    // FutBot daily reward card selection
    if (interaction.isButton() && interaction.customId.startsWith('futbot_daily_collect:')) {
      const { handleDailyCollect } = require('../utils/futbotDiscord');
      try {
        await handleDailyCollect(interaction);
      } catch (error) {
        console.error('Error collecting daily FutBot card:', error);
        const reply = { content: 'Could not collect that daily card.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    // Slash command handler
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) return;

      try {
        await command.execute(interaction, client);
      } catch (error) {
        console.error(
          `Error executing command ${interaction.commandName}:`,
          error
        );

        const reply = {
          content: 'An error occurred while executing this command.',
          ephemeral: true,
        };

        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }

      return;
    }

    // Select menu handler
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;

      // Division command menu
      if (customId === 'select_division') {
        const command = client.commands.get('division');

        if (!command?.handleSelect) return;

        try {
          await command.handleSelect(interaction, client);
        } catch (error) {
          console.error('Error handling division select:', error);

          const reply = {
            content: 'An error occurred while loading the division.',
            ephemeral: true,
          };

          if (interaction.deferred || interaction.replied) {
            await interaction.followUp(reply).catch(() => {});
          } else {
            await interaction.reply(reply).catch(() => {});
          }
        }

        return;
      }

      // Teaminfo division and team menus
      if (
        customId.startsWith('teaminfo-division-') ||
        customId.startsWith('teaminfo-team-')
      ) {
        const command = client.commands.get('teaminfo');

        if (!command?.handleSelect) {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'The team information handler could not be found.',
              ephemeral: true,
            }).catch(() => {});
          }

          return;
        }

        try {
          await command.handleSelect(interaction, client);
        } catch (error) {
          console.error('Error handling teaminfo select:', error);

          const reply = {
            content: 'An error occurred while loading team information.',
            ephemeral: true,
          };

          if (interaction.deferred || interaction.replied) {
            await interaction.followUp(reply).catch(() => {});
          } else {
            await interaction.reply(reply).catch(() => {});
          }
        }

        return;
      }
    }
  },
};
