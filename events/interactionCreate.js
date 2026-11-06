
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
      const command = client.commands.get('ssp');
      if (!command?.handleButton) return;
      try {
        await command.handleButton(interaction);
      } catch (error) {
        console.error('Error opening FutBot player pack:', error);
        const reply = { content: 'Could not open that player pack.', ephemeral: false };
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
        const reply = { content: 'Could not quicksell that player card.', ephemeral: false };
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
        const reply = { content: 'Could not buy that player.', ephemeral: false };
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
        const reply = { content: 'Could not sell that player.', ephemeral: false };
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
        const reply = { content: 'Could not cancel that sale.', ephemeral: false };
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
        const reply = { content: 'Could not collect that daily card.', ephemeral: false };
        if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
      return;
    }

    // Slash command handler
    if (interaction.isChatInputCommand()) {
      const commandLogChannelId = '1374495867691597976';
      const subcommand = interaction.commandName === 'mod'
        ? interaction.options.getSubcommand(false)
        : null;
      const commandKey = subcommand || interaction.commandName;
      const exemptCommandLogs = new Set(['stats', 'cases', 'viewpoints', 'history']);
      const commandsWithDetailedLogs = new Set([
        'purge', 'warn', 'editpoints', 'appoint', 'sack',
        'sign', 'release', 'hire', 'fire', 'addteam',
        'changedivision', 'createdivision', 'demote', 'disband',
        'promote', 'removedivision', 'removeteam',
        'renamedivision', 'renameteam',
      ]);
      const shouldLogCommand = !exemptCommandLogs.has(commandKey)
        && !commandsWithDetailedLogs.has(commandKey);

      if (shouldLogCommand) {
        const flattenOptions = options => (options || []).flatMap(option => {
          if (Array.isArray(option.options)) return flattenOptions(option.options);
          const value = option.value ?? option.user?.tag ?? option.channel?.name ?? option.role?.name ?? option.attachment?.name;
          return value === undefined ? [] : [`• ${option.name}: ${String(value).slice(0, 300)}`];
        });
        const optionLines = flattenOptions(interaction.options.data);
        const commandLog = {
          embeds: [{
            color: 0x5865f2,
            title: 'Command Used',
            fields: [
              { name: 'Command', value: `/${interaction.commandName}${subcommand ? ` ${subcommand}` : ''}`, inline: true },
              { name: 'Used By', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
              { name: 'Channel', value: interaction.channelId ? `<#${interaction.channelId}>` : 'Unknown', inline: true },
              ...(optionLines.length ? [{ name: 'Options', value: optionLines.join('\n').slice(0, 1024) }] : []),
            ],
            timestamp: new Date().toISOString(),
          }],
          allowedMentions: { parse: [] },
        };
        try {
          const logChannel = await client.channels.fetch(commandLogChannelId);
          if (logChannel?.isTextBased() && logChannel.send) {
            await logChannel.send(commandLog);
          } else {
            console.error('Command audit log channel is unavailable.');
          }
        } catch (error) {
          console.error('Failed to send command audit log:', error);
        }
      }
      const command = client.commands.get(interaction.commandName);

      if (!command) return;

      try {
        const futbotCommands = new Set([
          'ssp',
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
          ephemeral: interaction.commandName === 'ssp' && interaction.options.getSubcommand(false) === 'help',
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
        const command = client.commands.get('ssp');
        if (!command?.handleSelect) return;
        try {
          await command.handleSelect(interaction);
        } catch (error) {
          console.error('Error handling FutBot pack menu:', error);
          const reply = { content: 'Could not load that pack.', ephemeral: false };
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
