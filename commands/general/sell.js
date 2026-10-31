const { SlashCommandBuilder } = require('discord.js');
const { runPlayerSell } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('QuickSell one of your players')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('The player you want to quicksell')
        .setRequired(true)
        .setMaxLength(100)
    ),

  async execute(interaction) {
    return runPlayerSell(interaction, interaction.options.getString('player'));
  },
};
