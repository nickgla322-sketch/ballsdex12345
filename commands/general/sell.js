const { SlashCommandBuilder } = require('discord.js');
const { runPlayerSell } = require('../../utils/futbotDiscord');

module.exports = {
  data: null,

  async execute(interaction) {
    return runPlayerSell(interaction, interaction.options.getString('player'));
  },
};
