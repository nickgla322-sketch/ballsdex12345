const { SlashCommandBuilder } = require('discord.js');
const { runPlayerBuy } = require('../../utils/futbotDiscord');

module.exports = {
  data: null,

  async execute(interaction) {
    return runPlayerBuy(interaction, interaction.options.getString('player'));
  },
};
