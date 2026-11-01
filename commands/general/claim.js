const { SlashCommandBuilder } = require('discord.js');
const { runRewardClaim, post } = require('../../utils/futbotDiscord');

module.exports = {
  data: null,

  async execute(interaction) {
    return runRewardClaim(
      interaction,
      () => post('/api/v1/players/' + interaction.user.id + '/rewards/quick', {}),
      'Quick reward'
    );
  },
};
