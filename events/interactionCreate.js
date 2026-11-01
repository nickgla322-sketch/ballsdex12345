
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

    if (interaction.isButton() && interaction.customId.startsWith('futbot_pack_buy:')) {
      const command = client.commands.get('pack');
      if (!command?.handleButton) return;
      try {
        await command.handleButton(interaction);
      } catch (error) {
        console.error('Error opening FutBot player pack:', error);
        const reply = { content: 'Could not open that player pack.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    // FutBot reward-card quicksell buttons
    if (interaction.isButton() && interaction.customId.startsWith('futbot_quicksell:')) {
      const { handleQuickSell } = require('../utils/futbotDiscord');
      try {
        await handleQuickSell(interaction);
      } catch (error) {
        console.error('Error quickselling FutBot card:', error);
        const reply = { content: 'Could not quicksell that player card.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    // FutBot player buy and sell buttons
    if (interaction.isButton() && interaction.customId.startsWith('futbot_buy:')) {
      const { handlePlayerBuy } = require('../utils/futbotDiscord');
      try {
        await handlePlayerBuy(interaction);
      } catch (error) {
        console.error('Error buying FutBot player:', error);
        const reply = { content: 'Could not buy that player.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('futbot_sell:')) {
      const { handlePlayerSell } = require('../utils/futbotDiscord');
      try {
        await handlePlayerSell(interaction);
      } catch (error) {
        console.error('Error selling FutBot player:', error);
        const reply = { content: 'Could not sell that player.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('futbot_sell_cancel:')) {
      const { handlePlayerSellCancel } = require('../utils/futbotDiscord');
      try {
        await handlePlayerSellCancel(interaction);
      } catch (error) {
        console.error('Error cancelling FutBot sale:', error);
        const reply = { content: 'Could not cancel that sale.', ephemeral: true };
        if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
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
        const futbotCommands = new Set([
          '8', 'friendly', 'players', 'daily', 'claim', 'buy', 'sell', 'pack', 'futbot', 'futbotbattle', 'futbotdrop',
          'futbotimage', 'futbotinfo', 'futbotmarket',
          'futbotstatus', 'futbotsuggest', 'futbottrade', 'futbotadmin',
        ]);

        if (futbotCommands.has(interaction.commandName)) {
          const futbotApi = require('../utils/futbotApi');
          await futbotApi.request('/api/v1/players/' + interaction.user.id, {
            method: 'POST',
            body: JSON.stringify({ name: interaction.user.username }),
          });
        }

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

      if (customId.startsWith('futbot_pack_tier:')) {
        const command = client.commands.get('pack');
        if (!command?.handleSelect) return;
        try {
          await command.handleSelect(interaction);
        } catch (error) {
          console.error('Error handling FutBot pack menu:', error);
          const reply = { content: 'Could not load that pack.', ephemeral: true };
          if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
          else await interaction.reply(reply).catch(() => {});
        }
        return;
      }

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
