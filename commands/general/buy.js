const { SlashCommandBuilder } = require('discord.js');
const { runPlayerBuy } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy a player with coins')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The player you want to buy')
        .setRequired(true)
        .setMaxLength(100)
    ),

  async execute(interaction) {
    return runPlayerBuy(interaction, interaction.options.getString('player'));
  },
};
