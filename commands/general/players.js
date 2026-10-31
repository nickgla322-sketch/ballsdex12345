const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { futbotApi, cardFile } = require('../../utils/futbotDiscord');

const PAGE_SIZE = 5;

async function buildPage(cards, page, totalPages, username) {
  const start = page * PAGE_SIZE;
  const visible = cards.slice(start, start + PAGE_SIZE);
  const embeds = [];
  const files = [];

  for (const card of visible) {
    const embed = new EmbedBuilder()
      .setTitle(card.name || 'Unknown Player')
      .setColor(0x5865f2)
      .addFields(
        { name: 'Position', value: String(card.position || '—'), inline: true },
        { name: 'Copies', value: String(card.copies || 1), inline: true },
      );

    const file = await cardFile(card).catch(() => null);
    if (file) {
      embed.setImage('attachment://' + file.name);
      files.push(file);
    }
    embeds.push(embed);
  }

  if (embeds.length === 0) {
    embeds.push(
      new EmbedBuilder()
        .setTitle(username + "'s Players")
        .setColor(0x5865f2)
        .setDescription('You do not own any players yet.')
    );
  }

  embeds[0]
    .setAuthor({ name: username + "'s Players" })
    .setFooter({ text: 'Page ' + (page + 1) + ' of ' + totalPages + ' • ' + cards.length + ' different players' });

  return { embeds, files };
}

function buildButtons(page, totalPages, disabled = false) {
  if (totalPages <= 1) return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('players_show_prev')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('◀️')
        .setDisabled(disabled || page === 0),
      new ButtonBuilder()
        .setCustomId('players_show_next')
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('▶️')
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
        .setDescription('Show your players, images, positions, and copies')
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
      const initialPage = await buildPage(cards, page, totalPages, interaction.user.username);
      const message = await interaction.editReply({
        embeds: initialPage.embeds,
        files: initialPage.files,
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
        const nextPage = await buildPage(cards, page, totalPages, interaction.user.username);
        await buttonInteraction.update({
          embeds: nextPage.embeds,
          files: nextPage.files,
          attachments: [],
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
