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
  let output;
  try { output = JSON.stringify(data, null, 2); } catch { output = String(data); }
  if (output.length > 1750) output = output.slice(0, 1725) + '\n... (response shortened)';
  return 'JSON response:\n' + output;
}

async function run(interaction, operation, label = 'FutBot') {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
  try {
    const response = await operation();
    return interaction.editReply({ content: '**' + label + '**\n' + summarize(response?.data ?? response), embeds: [], components: [] });
  } catch (error) {
    console.error('[' + label + ']', error);
    return interaction.editReply({ content: '**' + label + ' error**\n' + String(error.message || 'Unknown API error').slice(0, 1800), embeds: [], components: [] });
  }
}

function post(path, body) { return futbotApi.request(path, { method: 'POST', body: JSON.stringify(body) }); }
function put(path, body) { return futbotApi.request(path, { method: 'PUT', body: JSON.stringify(body) }); }
function del(path, body) { return futbotApi.request(path, { method: 'DELETE', body: JSON.stringify(body) }); }

module.exports = { futbotApi, userIdOption, parseIdList, queryString, run, post, put, del };