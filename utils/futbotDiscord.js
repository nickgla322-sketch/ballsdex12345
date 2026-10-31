const { EmbedBuilder } = require('discord.js');
const futbotApi = require('./futbotApi');

function userIdOption(interaction, name = 'user') {
  return interaction.user.id;
}

function parseIdList(value, label = 'IDs') {
  const ids = String(value || '').split(',').map(item => Number(item.trim()));
  if (!ids.length || ids.some(id => !Number.isInteger(id) || id <= 0)) {
    throw new Error(label + ' must be a comma-separated list of positive numbers.');
  }
  return [...new Set(ids)];
}

function queryString(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? '?' + query : '';
}

function summarize(data) {
  const value = data && typeof data === 'object' && !Array.isArray(data) ? data : { result: data };
  const fields = [];
  const humanize = key => String(key).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const display = item => {
    if (item === null || item === undefined || item === '') return '—';
    if (typeof item === 'boolean') return item ? 'Yes' : 'No';
    if (Array.isArray(item)) {
      if (!item.length) return 'None';
      return item.slice(0, 12).map(entry => {
        if (entry && typeof entry === 'object') return (entry.name || entry.display_name || entry.card_id || entry.id || 'Item') + (entry.overall !== undefined ? ' · OVR ' + entry.overall : '');
        return String(entry);
      }).join('\n') + (item.length > 12 ? '\n…and ' + (item.length - 12) + ' more' : '');
    }
    if (typeof item === 'object') return Object.entries(item).slice(0, 12).map(([k, v]) => humanize(k) + ': ' + (v === null ? '—' : String(v))).join('\n') || 'No details';
    return String(item);
  };
  for (const [key, item] of Object.entries(value)) {
    if (key === 'ok') continue;
    fields.push({ name: humanize(key).slice(0, 256), value: display(item).slice(0, 1024) || '—', inline: !Array.isArray(item) && (typeof item !== 'object' || item === null) });
    if (fields.length >= 25) break;
  }
  return fields;
}

function collectCards(value, found = [], seen = new Set()) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    for (const item of value) collectCards(item, found, seen);
    return found;
  }
  if (value.card_id !== undefined && value.name && value.overall !== undefined) {
    const id = String(value.card_id);
    if (!seen.has(id)) { seen.add(id); found.push(value); }
  }
  for (const item of Object.values(value)) collectCards(item, found, seen);
  return found;
}

async function cardFile(card) {
  const base = (process.env.FUTBOT_API_URL || '').replace(/\/+$/, '');
  const key = process.env.FUTBOT_API_KEY || '';
  if (!base || !key) return null;
  const response = await fetch(base + '/api/v1/cards/' + encodeURIComponent(card.card_id) + '/image', {
    headers: { 'X-API-Key': key }
  });
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
  const name = 'futbot-card-' + card.card_id + '.' + ext;
  return { attachment: buffer, name };
}

async function cardCompareFile(cards) {
  const base = (process.env.FUTBOT_API_URL || '').replace(/\/+$/, '');
  const key = process.env.FUTBOT_API_KEY || '';
  if (!base || !key || cards.length !== 2) return null;
  const ids = cards.map(card => card.card_id).join(',');
  const response = await fetch(base + '/api/v1/cards/compare-image?ids=' + encodeURIComponent(ids), {
    headers: { 'X-API-Key': key }
  });
  if (!response.ok) return null;
  return { attachment: Buffer.from(await response.arrayBuffer()), name: 'futbot-card-comparison.png' };
}

function cardStatsSummary(card) {
  return [
    '**ATK** ' + (card.attack ?? '—'),
    '**DEF** ' + (card.defense ?? '—'),
    '**SPD** ' + (card.speed ?? '—'),
    '**Position** ' + (card.position || '—'),
    '**Club** ' + (card.club || '—'),
  ].join('  •  ');
}

function cardEmbed(card, file) {
  const embed = new EmbedBuilder()
    .setTitle((card.name || 'Unknown player') + '  |  ' + (card.overall ?? '?') + ' OVR')
    .setColor(0x5865f2)
    .setDescription([card.club, card.position, card.card_rarity].filter(Boolean).join('  •  ') || 'Player card')
    .addFields(
      { name: '⚔️ Attack', value: String(card.attack ?? '—'), inline: true },
      { name: '🛡️ Defense', value: String(card.defense ?? '—'), inline: true },
      { name: '⚡ Speed', value: String(card.speed ?? '—'), inline: true },
      { name: 'League', value: String(card.league || '—'), inline: true },
      { name: 'Nation', value: String(card.nation || '—'), inline: true },
      { name: 'Card ID', value: String(card.card_id), inline: true },
    );
  if (file) embed.setThumbnail('attachment://' + file.name);
  return embed;
}

async function run(interaction, operation, label = 'FutBot') {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
  try {
    const response = await operation();
    const data = response?.data ?? response;
    const cards = collectCards(data);
    const embed = new EmbedBuilder().setTitle(label).setColor(0x5865f2).setTimestamp();
    const files = [];
    const cardEmbeds = [];
    if (cards.length === 2) {
      const comparison = await cardCompareFile(cards).catch(() => null);
      if (comparison) {
        files.push(comparison);
        embed.setDescription('**' + cards[0].name + '  vs  ' + cards[1].name + '**')
          .setImage('attachment://' + comparison.name)
          .addFields(
            { name: cards[0].name + ' · ' + cards[0].overall + ' OVR', value: cardStatsSummary(cards[0]), inline: true },
            { name: cards[1].name + ' · ' + cards[1].overall + ' OVR', value: cardStatsSummary(cards[1]), inline: true },
          );
      }
    }
    if (!cardEmbeds.length && cards.length && !embed.data.image) {
      for (const card of cards.slice(0, 9)) {
        const file = await cardFile(card).catch(() => null);
        if (file) files.push(file);
        cardEmbeds.push(cardEmbed(card, file));
      }
      embed.setDescription(cards.length > 9 ? 'Showing 9 of ' + cards.length + ' player cards.' : 'Player cards');
    } else if (!cards.length) {
      const fields = summarize(data);
      if (fields.length) embed.addFields(fields);
      else embed.setDescription('Completed successfully.');
    }
    return interaction.editReply({ content: '', embeds: [embed, ...cardEmbeds], files, components: [] });
  } catch (error) {
    console.error('[' + label + ']', error);
    return interaction.editReply({ content: '**' + label + ' error**\n' + String(error.message || 'Unknown API error').slice(0, 1800), embeds: [], components: [] });
  }
}

async function runDailyClaim(interaction, operation) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
  try {
    const response = await operation();
    const data = response?.data ?? response;
    const choices = data.choices || [];
    const main = new EmbedBuilder()
      .setTitle('Daily reward')
      .setColor(0x5865f2)
      .setDescription('Choose one of the two player cards below. Your choice expires in 2 minutes.')
      .addFields(
        { name: 'Streak', value: String(data.streak ?? '—'), inline: true },
        { name: 'Coins earned', value: String(data.coins_earned ?? '—'), inline: true },
        { name: 'New balance', value: String(data.balance ?? '—'), inline: true },
      );
    const files = [];
    const comparison = await cardCompareFile(choices.slice(0, 2)).catch(() => null);
    if (comparison) {
      files.push(comparison);
      main.setImage('attachment://' + comparison.name);
      for (const card of choices.slice(0, 2)) {
        main.addFields({ name: card.name + ' · ' + card.overall + ' OVR', value: cardStatsSummary(card), inline: true });
      }
    } else {
      for (const card of choices.slice(0, 2)) {
        const file = await cardFile(card).catch(() => null);
        if (file) files.push(file);
        main.addFields({ name: card.name + ' · ' + card.overall + ' OVR', value: cardStatsSummary(card), inline: false });
      }
    }
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      ...choices.slice(0, 2).map(card => new ButtonBuilder()
        .setCustomId('futbot_daily_collect:' + card.card_id + ':' + interaction.user.id)
        .setLabel('Choose ' + String(card.name).slice(0, 55))
        .setStyle(ButtonStyle.Primary))
    );
    return interaction.editReply({ content: '', embeds: [main], files, components: choices.length ? [row] : [] });
  } catch (error) {
    console.error('[Daily reward]', error);
    return interaction.editReply({ content: '**Daily reward error**\n' + String(error.message || 'Unknown API error').slice(0, 1800), embeds: [], components: [] });
  }
}

async function handleDailyCollect(interaction) {
  const [, cardId, ownerId] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) {
    return interaction.reply({ content: 'This daily reward belongs to another player.', ephemeral: true });
  }
  await interaction.deferUpdate();
  try {
    const response = await post('/api/v1/players/' + ownerId + '/daily/collect', { card_id: Number(cardId) });
    const card = (response?.data ?? response).card;
    const file = await cardFile(card).catch(() => null);
    const embed = cardEmbed(card, file).setTitle('Daily card collected!');
    return interaction.editReply({ content: 'You selected **' + card.name + '**!', embeds: [embed], files: file ? [file] : [], components: [] });
  } catch (error) {
    return interaction.editReply({ content: '**Daily selection error**\n' + String(error.message || 'Unknown API error').slice(0, 1800), embeds: [], components: [] });
  }
}

function post(path, body) { return futbotApi.request(path, { method: 'POST', body: JSON.stringify(body) }); }
function put(path, body) { return futbotApi.request(path, { method: 'PUT', body: JSON.stringify(body) }); }
function del(path, body) { return futbotApi.request(path, { method: 'DELETE', body: JSON.stringify(body) }); }

module.exports = { futbotApi, userIdOption, parseIdList, queryString, run, runDailyClaim, handleDailyCollect, post, put, del };