const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { userIdOption, run, post, put, del } = require('../../utils/futbotDiscord');

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

async function attachmentBase64(attachment) {
  if (!attachment) return null;
  if (attachment.size > MAX_IMAGE_BYTES) throw new Error('Images must be 3 MB or smaller.');
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error('Could not download the attached image from Discord.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Images must be 3 MB or smaller.');
  return bytes.toString('base64');
}

function cardPayload(interaction) {
  const fields = {
    card_id: interaction.options.getInteger('card-id'),
    name: interaction.options.getString('name'),
    attack: interaction.options.getInteger('attack'),
    defense: interaction.options.getInteger('defense'),
    speed: interaction.options.getInteger('speed'),
    overall: interaction.options.getInteger('overall'),
    card_rarity: interaction.options.getString('rarity'),
    card_type: interaction.options.getString('type'),
    player_id: interaction.options.getString('player-id'),
    height: interaction.options.getString('height'),
    club: interaction.options.getString('club'),
    position: interaction.options.getString('position'),
    league: interaction.options.getString('league'),
    nation: interaction.options.getString('nation'),
  };
  for (const [key, value] of Object.entries(fields)) if (value === null) delete fields[key];
  return fields;
}

function addCardFields(sub, required, includeRequiredImage = false) {
  sub
    .addIntegerOption(o => o.setName('card-id').setDescription('Unique card ID').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('name').setDescription('Player/card name').setRequired(required).setMaxLength(100))
    .addIntegerOption(o => o.setName('attack').setDescription('Attack stat (0-99)').setRequired(required).setMinValue(0).setMaxValue(99))
    .addIntegerOption(o => o.setName('defense').setDescription('Defense stat (0-99)').setRequired(required).setMinValue(0).setMaxValue(99))
    .addIntegerOption(o => o.setName('speed').setDescription('Speed stat (0-99)').setRequired(required).setMinValue(0).setMaxValue(99))
    .addIntegerOption(o => o.setName('overall').setDescription('Overall rating (0-99)').setRequired(required).setMinValue(0).setMaxValue(99))
    .addStringOption(o => o.setName('rarity').setDescription('Card rarity').setRequired(required).setMaxLength(40))
    .addStringOption(o => o.setName('type').setDescription('Card type, e.g. Standard, Icon, Hero').setRequired(required).setMaxLength(40));

  // Discord requires every required option to appear before optional options.
  if (includeRequiredImage) {
    sub.addAttachmentOption(o => o.setName('image').setDescription('Card image (PNG, JPG, WEBP, or GIF)').setRequired(true));
  }

  sub
    .addStringOption(o => o.setName('player-id').setDescription('Optional player identifier').setMaxLength(100))
    .addStringOption(o => o.setName('height').setDescription('Player height').setMaxLength(30))
    .addStringOption(o => o.setName('club').setDescription('Club').setMaxLength(100))
    .addStringOption(o => o.setName('position').setDescription('Position').setMaxLength(40))
    .addStringOption(o => o.setName('league').setDescription('League').setMaxLength(100))
    .addStringOption(o => o.setName('nation').setDescription('Nation').setMaxLength(100));

  return sub;
}

module.exports = {
  data: null,

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const admin_id = userIdOption(interaction);
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
    if (sub === 'give-coins') {
      const user = interaction.options.getUser('user');
      return run(interaction, () => post('/api/v1/admin/coins', { admin_id, user_id: user.id, amount: interaction.options.getInteger('amount') }), 'Give coins');
    }
    if (sub === 'give-card') {
      const user = interaction.options.getUser('user');
      return run(interaction, () => post('/api/v1/admin/cards/give', { admin_id, user_id: user.id, card_id: interaction.options.getInteger('card-id') }), 'Give card');
    }
    if (sub === 'remove-player-card') {
      const user = interaction.options.getUser('user');
      return run(interaction, () => post('/api/v1/admin/cards/remove', { admin_id, user_id: user.id, card_id: interaction.options.getInteger('card-id') }), 'Remove player card');
    }
    if (sub === 'create-card') {
      return run(interaction, async () => {
        const payload = cardPayload(interaction);
        payload.admin_id = admin_id;
        payload.image_base64 = await attachmentBase64(interaction.options.getAttachment('image'));
        return post('/api/v1/admin/cards/catalog', payload);
      }, 'Create catalog card');
    }
    if (sub === 'replace-card') {
      const card_id = interaction.options.getInteger('card-id');
      return run(interaction, async () => {
        const payload = cardPayload(interaction);
        payload.admin_id = admin_id;
        const image = interaction.options.getAttachment('image');
        if (image) payload.image_base64 = await attachmentBase64(image);
        delete payload.card_id;
        return put('/api/v1/admin/cards/catalog/' + card_id, payload);
      }, 'Replace catalog card');
    }
    if (sub === 'remove-card') {
      const card_id = interaction.options.getInteger('card-id');
      return run(interaction, () => del('/api/v1/admin/cards/catalog/' + card_id, { admin_id }), 'Delete catalog card');
    }
    if (sub === 'import-json') {
      return run(interaction, async () => {
        const file = interaction.options.getAttachment('file');
        if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Please attach a .json file.');
        if (file.size > 10 * 1024 * 1024) throw new Error('The JSON file must be 10 MB or smaller.');
        const response = await fetch(file.url);
        if (!response.ok) throw new Error('Could not download the JSON file from Discord.');
        const cards = await response.json().catch(() => { throw new Error('The attached file is not valid JSON.'); });
        const entries = Array.isArray(cards) ? cards : cards.cards;
        if (!Array.isArray(entries) || entries.length < 1 || entries.length > 50) throw new Error('The JSON must contain 1-50 cards, either as an array or inside a "cards" property.');
        return post('/api/v1/admin/cards/import', { admin_id, cards: entries });
      }, 'Import card catalog');
    }
    if (sub === 'wipe-cards') {
      const confirmation = interaction.options.getString('confirmation');
      if (confirmation !== 'WIPE ALL CARDS') {
        return interaction.editReply({ content: 'Nothing was deleted. Type exactly: `WIPE ALL CARDS`.' });
      }
      return run(interaction, () => post('/api/v1/admin/cards/wipe', {
        admin_id,
        confirmation,
      }), 'Wipe player card catalog');
    }
  },
};
