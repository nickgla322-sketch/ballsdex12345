const { SlashCommandBuilder } = require('discord.js');
const { userIdOption, run, post } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder().setName('futbotmarket').setDescription('Create FutBot marketplace listings')
    .addSubcommand(s => s.setName('list').setDescription('List one of your card editions').addIntegerOption(o => o.setName('card-id').setDescription('Card ID').setRequired(true)).addIntegerOption(o => o.setName('edition').setDescription('Edition number').setRequired(true).setMinValue(1)).addIntegerOption(o => o.setName('price').setDescription('Price in coins').setRequired(true).setMinValue(1)).addIntegerOption(o => o.setName('hours').setDescription('Listing duration in hours').setRequired(true).setMinValue(1).setMaxValue(720))),
  async execute(interaction) {
    const uid = userIdOption(interaction);
    return run(interaction, () => post('/api/v1/market/listings', {
      user_id: uid,
      card_id: interaction.options.getInteger('card-id'),
      edition: interaction.options.getInteger('edition'),
      price: interaction.options.getInteger('price'),
      duration_hours: interaction.options.getInteger('hours'),
    }), 'Create listing');
  },
};
