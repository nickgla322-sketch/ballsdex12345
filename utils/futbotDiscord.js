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
  const humanize = key => String(key).replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
  const display = item => {
    if (item === null || item === undefined || item === '') return '—';
    if (typeof item === 'boolean') return item ? 'Yes' : 'No';
    if (Array.isArray(item)) {
      if (!item.length) return 'None';
      return item.slice(0, 12).map(entry => {
        if (entry && typeof entry === 'object') return (entry.name || entry.display_name || entry.card_id || entry.id || 'Item') + (entry.overall !== undefined ? ' · OVR ' + entry.overall : '');
        return String(entry);
      }).join('\\n') + (item.length > 12 ? '\\n…and ' + (item.length - 12) + ' more' : '');
    }
    if (typeof item === 'object') return Object.entries(item).slice(0, 12).map(([k, v]) => humanize(k) + ': ' + (v === null ? '—' : String(v))).join('\\n') || 'No details';
    return String(item);
  };
  for (const [key, item] of Object.entries(value)) {
    if (key === 'ok') continue;
    fields.push({ name: humanize(key).slice(0, 256), value: display(item).slice(0, 1024) || '—', inline: !Array.isArray(item) && (typeof item !== 'object' || item === null) });
    if (fields.length >= 25) break;
  }
  return fields;
}

async function run(interaction, operation, label = 'FutBot') {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
  try {
    const response = await operation();
    const fields = summarize(response?.data ?? response);
    const embed = new EmbedBuilder().setTitle(label).setColor(0x2d9cdb).setTimestamp();
    if (fields.length) embed.addFields(fields);
    else embed.setDescription('Completed successfully.');
    return interaction.editReply({ content: '', embeds: [embed], components: [] });
  } catch (error) {
    console.error('[' + label + ']', error);
    return interaction.editReply({ content: '**' + label + ' error**\n' + String(error.message || 'Unknown API error').slice(0, 1800), embeds: [], components: [] });
  }
}

function post(path, body) { return futbotApi.request(path, { method: 'POST', body: JSON.stringify(body) }); }
function put(path, body) { return futbotApi.request(path, { method: 'PUT', body: JSON.stringify(body) }); }
function del(path, body) { return futbotApi.request(path, { method: 'DELETE', body: JSON.stringify(body) }); }

module.exports = { futbotApi, userIdOption, parseIdList, queryString, run, post, put, del };