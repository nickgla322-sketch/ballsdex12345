const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const futbotApi = require('../../utils/futbotApi');
const { cardFile, cardEmbed } = require('../../utils/futbotDiscord');

const PACKS = {
  bronze: { name: 'Bronze Player Packs', range: '45–64 OVR', prices: { 2: 2250, 5: 16800, 10: 29400 } },
  silver: { name: 'Silver Player Packs', range: '65–74 OVR', prices: { 2: 5750, 5: 40000, 10: 70000 } },
  gold: { name: 'Gold Player Packs', range: '75–99 OVR', prices: { 2: 18000, 5: 52800, 10: 92400 } },
};

function formatCoins(value) {
  return Number(value || 0).toLocaleString() + ' coins';
}

function packMenu(ownerId) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('futbot_pack_tier:' + ownerId)
    .setPlaceholder('Choose a player pack...')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Bronze Player Packs').setValue('bronze').setDescription('45–64 OVR players'),
      new StringSelectMenuOptionBuilder().setLabel('Silver Player Packs').setValue('silver').setDescription('65–74 OVR players'),
      new StringSelectMenuOptionBuilder().setLabel('Gold Player Packs').setValue('gold').setDescription('75–99 OVR players'),
      new StringSelectMenuOptionBuilder().setLabel('Special Player Packs').setValue('special').setDescription('Coming soon — no Special cards yet'),
    );
  return new ActionRowBuilder().addComponents(menu);
}

function packSizeRows(tier, ownerId) {
  const pack = PACKS[tier];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('futbot_pack_buy:' + tier + ':2:' + ownerId)
      .setLabel('Small · 2 players · ' + formatCoins(pack.prices[2])).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('futbot_pack_buy:' + tier + ':5:' + ownerId)
      .setLabel('Medium · 5 players · ' + formatCoins(pack.prices[5])).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('futbot_pack_buy:' + tier + ':10:' + ownerId)
      .setLabel('Jumbo · 10 players · ' + formatCoins(pack.prices[10])).setStyle(ButtonStyle.Success),
  );
  return [row, packMenu(ownerId)];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pack')
    .setDescription('Browse and buy player packs'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('Player Packs')
      .setColor(0x5865f2)
      .setDescription(
        'Choose a pack category below. Each pack contains random players from its overall range.\n\n' +
        '**Bronze:** 45–64 OVR\n**Silver:** 65–74 OVR\n**Gold:** 75–99 OVR\n**Special:** Coming soon'
      );
    return interaction.reply({
      embeds: [embed],
      components: [packMenu(interaction.user.id)],
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleSelect(interaction) {
    const ownerId = interaction.customId.split(':')[1];
    if (interaction.user.id !== ownerId) {
      return interaction.reply({ content: 'This pack menu belongs to another player.', flags: MessageFlags.Ephemeral });
    }
    const tier = interaction.values[0];
    if (tier === 'special') {
      return interaction.reply({
        content: 'Special Player Packs are coming soon. There are no Special cards available yet.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const pack = PACKS[tier];
    if (!pack) return interaction.reply({ content: 'Invalid pack selection.', flags: MessageFlags.Ephemeral });
    const embed = new EmbedBuilder()
      .setTitle(pack.name)
      .setColor(0x5865f2)
      .setDescription(
        '**Eligible players:** ' + pack.range + '\n\n' +
        '**Small:** 2 players — ' + formatCoins(pack.prices[2]) + '\n' +
        '**Medium:** 5 players — ' + formatCoins(pack.prices[5]) + '\n' +
        '**Jumbo:** 10 players — ' + formatCoins(pack.prices[10]) + '\n\n' +
        'Jumbo gives you 10 players for the price of 8.'
      );
    return interaction.update({ embeds: [embed], components: packSizeRows(tier, ownerId) });
  },

  async handleButton(interaction) {
    const [, tier, rawSize, ownerId] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) {
      return interaction.reply({ content: 'This pack menu belongs to another player.', flags: MessageFlags.Ephemeral });
    }
    const pack = PACKS[tier];
    const size = Number(rawSize);
    if (!pack || !pack.prices[size]) {
      return interaction.reply({ content: 'That pack is not available.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferUpdate();
    try {
      const response = await futbotApi.request('/api/v1/players/' + ownerId + '/packs/open', {
        method: 'POST',
        body: JSON.stringify({ tier, size }),
      });
      const data = response?.data ?? response;
      const embeds = [];
      const files = [];
      const rows = [];
      const buttons = [];

      for (const card of (data.cards || []).slice(0, 10)) {
        const file = await cardFile(card).catch(() => null);
        if (file) files.push(file);
        const embed = cardEmbed(card, file).addFields(
          { name: 'Player value', value: formatCoins(card.value), inline: true },
          { name: 'QuickSell value', value: formatCoins(card.quicksell_value), inline: true },
        );
        embeds.push(embed);
        buttons.push(new ButtonBuilder()
          .setCustomId('futbot_quicksell:' + card.card_id + ':' + ownerId)
          .setLabel('QuickSell ' + Number(card.quicksell_value || 0).toLocaleString())
          .setStyle(ButtonStyle.Danger));
      }

      for (let i = 0; i < buttons.length; i += 2) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 2)));
      }

      return interaction.editReply({
        content: '**' + pack.name + ' opened!** You received ' + data.cards_received +
          ' players for **' + formatCoins(data.spent) + '**. Remaining balance: **' +
          formatCoins(data.balance) + '**.',
        embeds,
        files,
        components: rows,
      });
    } catch (error) {
      return interaction.followUp({
        content: '**Pack purchase failed:** ' + String(error.message || 'Unknown API error').slice(0, 1500),
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

// Pack price display is kept in sync with the API's PLAYER_PACKS costs.
// Redeploy marker: refresh the live /pack menu price labels.
