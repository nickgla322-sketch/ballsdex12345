const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { futbotApi } = require('../../utils/futbotDiscord');

const PAGE_SIZE = 10;

function buildPage(cards, page, totalPages) {
  const visible = cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const description = visible.map((card, index) => {
    const number = page * PAGE_SIZE + index + 1;
    return '**' + number + '. ' + (card.name || 'Unknown Player') + '**' +
      '\nPosition: ' + (card.position || '—') +
      ' | Overall: ' + (card.overall ?? '—');
  }).join('\n\n');

  return new EmbedBuilder()
    .setTitle('Your Players')
    .setColor(0x5865f2)
    .setDescription(description || 'You do not own any players yet.')
    .setFooter({ text: 'Page ' + (page + 1) + ' of ' + totalPages + ' • ' + cards.length + ' players' });
}

function buildButtons(page, totalPages, disabled = false) {
  if (totalPages <= 1) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('players_show_prev')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
        .setDisabled(disabled || page === 0),
      new ButtonBuilder()
        .setCustomId('players_show_next')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('➡️')
        .setDisabled(disabled || page >= totalPages - 1),
    ),
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('players')
    .setDescription('View all the players you own')
    .addSubcommand(subcommand =>
      subcommand
        .setName('show')
        .setDescription('Show player names, positions, and overalls')
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const response = await futbotApi.request(
        '/api/v1/players/' + interaction.user.id + '/inventory',
        { method: 'GET' }
      );
      const data = response?.data ?? response;
      const inventory = Array.isArray(data?.cards) ? data.cards : [];

      // Combine multiple editions of the same card into one player entry.
      const byCard = new Map();
      for (const card of inventory) {
        const id = String(card.card_id);
        if (!byCard.has(id)) byCard.set(id, { ...card, copies: 0 });
        byCard.get(id).copies += 1;
      }
      const cards = [...byCard.values()].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''))
      );

      const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
      let page = 0;
      const message = await interaction.editReply({
        embeds: [buildPage(cards, page, totalPages)],
        components: buildButtons(page, totalPages),
      });

      if (totalPages <= 1) return;

      const collector = message.createMessageComponentCollector({
        time: 120000,
        filter: buttonInteraction => buttonInteraction.user.id === interaction.user.id,
      });

      collector.on('collect', async buttonInteraction => {
        if (buttonInteraction.customId === 'players_show_prev') page = Math.max(0, page - 1);
        if (buttonInteraction.customId === 'players_show_next') page = Math.min(totalPages - 1, page + 1);
        await buttonInteraction.update({
          embeds: [buildPage(cards, page, totalPages)],
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
      console.error('[players show]', error);
      return interaction.editReply({
        content: '**Players error**\\n' + String(error.message || 'Unknown API error').slice(0, 1800),
        embeds: [],
        components: [],
      });
    }
  },
};
