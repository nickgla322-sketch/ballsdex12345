const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');

async function fetchApiImage(path) {
  const base = (process.env.FUTBOT_API_URL || '').replace(/\\/+$/, '');
  const key = process.env.FUTBOT_API_KEY || '';
  if (!base || !key) throw new Error('FUTBOT_API_URL or FUTBOT_API_KEY is not configured.');
  const response = await fetch(base + path, { headers: { 'X-API-Key': key } });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try { message = JSON.parse(text).error || text; } catch {}
    throw new Error(message || ('Image API returned HTTP ' + response.status));
  }
  return Buffer.from(await response.arrayBuffer());
}

module.exports = {
  data: new SlashCommandBuilder().setName('futbotimage').setDescription('View card artwork')
    .addSubcommand(s => s.setName('card').setDescription('View a card image').addIntegerOption(o => o.setName('card-id').setDescription('Card ID').setRequired(true))),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const cardId = interaction.options.getInteger('card-id');
      const buffer = await fetchApiImage('/api/v1/cards/' + cardId + '/image');
      const attachment = new AttachmentBuilder(buffer, { name: 'futbot-card-' + cardId + '.png' });
      return interaction.editReply({ content: 'FutBot card image', files: [attachment] });
    } catch (error) {
      console.error('[FutBot image]', error);
      return interaction.editReply({ content: '**FutBot image error**\\n' + String(error.message || 'Unable to load image').slice(0, 1700) });
    }
  },
};
