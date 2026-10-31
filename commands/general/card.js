const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { futbotApi, queryString, cardFile } = require('../../utils/futbotDiscord');

const PAGE_SIZE = 5;
const CATEGORIES = ['bronze', 'silver', 'gold', 'special'];
const POSITIONS = [
  'GK', 'CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB',
  'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST',
];
const COLORS = {
  bronze: 0xCD7F32,
  silver: 0xC0C0C0,
  gold: 0xFFD700,
  special: 0x5865F2,
};

function buildComponents(state, totalPages, disabled = false) {
  const navigation = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('card_search_prev')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⬅️')
      .setDisabled(disabled || state.page <= 0),
    new ButtonBuilder()
      .setCustomId('card_search_next')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('➡️')
      .setDisabled(disabled || state.page >= totalPages - 1),
  );

  const category = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('card_search_category')
      .setLabel('Category: ' + state.category.charAt(0).toUpperCase() + state.category.slice(1))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );

  const positionOptions = [
    { label: 'All positions', value: 'all', default: !state.position },
    ...POSITIONS.map(position => ({
      label: position,
      value: position,
      default: state.position === position,
    })),
  ];
  const position = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('card_search_position')
      .setPlaceholder('Position: ' + (state.position || 'All'))
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(disabled)
      .addOptions(positionOptions),
  );

  return [navigation, category, position];
}

async function buildPage(state) {
  const query = queryString({
    tier: state.category,
    position: state.position,
    limit: PAGE_SIZE,
    offset: state.page * PAGE_SIZE,
  });
  const response = await futbotApi.request('/api/v1/cards' + query, { method: 'GET' });
  const data = response?.data ?? response;
  const cards = Array.isArray(data.cards) ? data.cards : [];
  const total = Number(data.total ?? data.count ?? cards.length);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages - 1);

  const files = [];
  const embeds = [];
  for (const card of cards) {
    const file = await cardFile(card).catch(() => null);
    if (file) files.push(file);

    const embed = new EmbedBuilder()
      .setColor(COLORS[state.category] || COLORS.special)
      .setTitle(card.name || 'Unknown Player')
      .setDescription(
        '**' + (card.overall ?? '-') + ' OVR**' +
        '  •  ' + (card.position || 'Unknown position') +
        (card.club ? '\\n' + card.club : '')
      )
      .addFields(
        { name: 'Player value', value: Number(card.value ?? 0).toLocaleString() + ' coins', inline: true },
        { name: 'QuickSell value', value: Number(card.quicksell_value ?? 0).toLocaleString() + ' coins', inline: true },
        { name: 'Card ID', value: String(card.card_id), inline: true },
      )
      .setFooter({ text: 'Page ' + (state.page + 1) + ' of ' + totalPages + ' • ' + total + ' players' });

    if (file) embed.setImage('attachment://' + file.name);
    embeds.push(embed);
  }

  if (!embeds.length) {
    embeds.push(
      new EmbedBuilder()
        .setColor(COLORS[state.category] || COLORS.special)
        .setTitle(state.category.charAt(0).toUpperCase() + state.category.slice(1) + ' players')
        .setDescription(
          state.category === 'special'
            ? 'Special cards are not available yet.'
            : 'No players were found for this category and position.'
        )
        .setFooter({ text: 'Page 1 of 1 • 0 players' })
    );
  }

  return {
    embeds,
    files,
    components: buildComponents(state, totalPages),
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('card')
    .setDescription('Browse the FutBot player card catalog')
    .addSubcommand(subcommand =>
      subcommand
        .setName('search')
        .setDescription('Browse cards by category and position')
        .addStringOption(option =>
          option
            .setName('category')
            .setDescription('Card category')
            .addChoices(
              { name: 'Bronze', value: 'bronze' },
              { name: 'Silver', value: 'silver' },
              { name: 'Gold', value: 'gold' },
              { name: 'Special', value: 'special' },
            )
        )
        .addStringOption(option =>
          option
            .setName('position')
            .setDescription('Filter by player position')
            .addChoices(...POSITIONS.map(position => ({ name: position, value: position })))
        )
    ),

  async execute(interaction) {
    const state = {
      category: interaction.options.getString('category') || 'bronze',
      position: interaction.options.getString('position') || '',
      page: 0,
    };

    await interaction.deferReply();
    try {
      const payload = await buildPage(state);
      const message = await interaction.editReply(payload);
      const collector = message.createMessageComponentCollector({
        time: 300000,
        filter: component => component.user.id === interaction.user.id,
      });

      collector.on('collect', async component => {
        try {
          if (component.customId === 'card_search_prev') {
            state.page = Math.max(0, state.page - 1);
          } else if (component.customId === 'card_search_next') {
            state.page += 1;
          } else if (component.customId === 'card_search_category') {
            const index = CATEGORIES.indexOf(state.category);
            state.category = CATEGORIES[(index + 1) % CATEGORIES.length];
            state.page = 0;
          } else if (component.customId === 'card_search_position') {
            state.position = component.values[0] === 'all' ? '' : component.values[0];
            state.page = 0;
          }

          const nextPayload = await buildPage(state);
          await component.update(nextPayload);
        } catch (error) {
          console.error('[Card search pagination]', error);
          if (!component.replied && !component.deferred) {
            await component.reply({
              content: 'Could not load that page: ' + String(error.message || 'Unknown API error').slice(0, 1200),
              ephemeral: true,
            }).catch(() => {});
          }
        }
      });

      collector.on('end', async () => {
        try {
          const current = await buildPage(state);
          await interaction.editReply({
            embeds: current.embeds,
            components: buildComponents(state, Math.max(1, Math.ceil(
              Number((await futbotApi.request('/api/v1/cards' + queryString({
                tier: state.category,
                position: state.position,
                limit: 1,
                offset: 0,
              }))?.data?.total ?? 0) / PAGE_SIZE
            )), true),
            files: current.files,
          });
        } catch {
          // The original message may have expired or been deleted.
        }
      });
    } catch (error) {
      console.error('[Card search]', error);
      return interaction.editReply({
        content: '**Card search error**\\n' + String(error.message || 'Unknown API error').slice(0, 1800),
        embeds: [],
        components: [],
      });
    }
  },
};
