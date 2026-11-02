const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { futbotApi } = require('../../utils/futbotDiscord');

const PAGE_SIZE = 10;

function buildPage(cards, startingEightIds, page, totalPages) {
  const visible = cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const description = visible.map((card, index) => {
    const number = page * PAGE_SIZE + index + 1;
    const inStartingEight = startingEightIds.has(String(card.card_id));
    const status = inStartingEight ? '🟢 **Starting 8**' : '⚪ Not in Starting 8';

    return '**' + number + '. ' + (card.name || 'Unknown Player') + '**' +
      '\nPosition: ' + (card.position || '-') +
      ' | Overall: ' + (card.overall ?? '-') +
      ' | ' + status;
  }).join('\n\n');

  return new EmbedBuilder()
    .setTitle('Your Club')
    .setColor(0x5865f2)
    .setDescription(description || 'You do not own any players yet.')
    .setFooter({ text: 'Page ' + (page + 1) + ' of ' + totalPages + ' • ' + cards.length + ' players' });
}

function buildButtons(page, totalPages, disabled = false) {
  if (totalPages <= 1) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('club_search_prev')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
        .setDisabled(disabled || page === 0),
      new ButtonBuilder()
        .setCustomId('club_search_next')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('➡️')
        .setDisabled(disabled || page >= totalPages - 1),
    ),
  ];
}

module.exports = {
  data: null,

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const userId = interaction.user.id;
      const [inventoryResponse, lineupResponse] = await Promise.all([
        futbotApi.request(
          '/api/v1/players/' + userId + '/inventory',
          { method: 'GET' }
        ),
        futbotApi.request(
          '/api/v1/players/' + userId + '/lineup',
          { method: 'GET' }
        ).catch(() => null),
      ]);

      const inventoryData = inventoryResponse?.data ?? inventoryResponse;
      const inventory = Array.isArray(inventoryData?.cards) ? inventoryData.cards : [];

      const lineupData = lineupResponse?.data ?? lineupResponse;
      const startingEightIds = new Set(
        (Array.isArray(lineupData?.slots) ? lineupData.slots : [])
          .filter(slot => slot?.card?.card_id !== undefined && slot?.card?.card_id !== null)
          .map(slot => String(slot.card.card_id))
      );

      // Combine multiple editions of the same card into one player entry.
      const byCard = new Map();
      for (const card of inventory) {
        const id = String(card.card_id);
        if (!byCard.has(id)) byCard.set(id, { ...card, copies: 0 });
        byCard.get(id).copies += 1;
      }
      const cards = [...byCard.values()].sort((a, b) =>
        (Number(b.overall) || 0) - (Number(a.overall) || 0) ||
        String(a.name || '').localeCompare(String(b.name || ''))
      );

      const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
      let page = 0;
      const message = await interaction.editReply({
        embeds: [buildPage(cards, startingEightIds, page, totalPages)],
        components: buildButtons(page, totalPages),
      });

      if (totalPages <= 1) return;

      const collector = message.createMessageComponentCollector({
        time: 120000,
        filter: buttonInteraction => buttonInteraction.user.id === userId,
      });

      collector.on('collect', async buttonInteraction => {
        if (buttonInteraction.customId === 'club_search_prev') page = Math.max(0, page - 1);
        if (buttonInteraction.customId === 'club_search_next') page = Math.min(totalPages - 1, page + 1);
        await buttonInteraction.update({
          embeds: [buildPage(cards, startingEightIds, page, totalPages)],
          components: buildButtons(page, totalPages),
        });
      });

      collector.on('end', async () => {
        try {
          await interaction.editReply({
            components: buildButtons(page, totalPages, true),
          });
        } catch (error) {
          // The interaction may have been deleted or expired.
        }
      });
    } catch (error) {
      console.error('[club search]', error);
      return interaction.editReply({
        content: '**Players error**\\n' + String(error.message || 'Unknown API error').slice(0, 1800),
        embeds: [],
        components: [],
      });
    }
  },
};
