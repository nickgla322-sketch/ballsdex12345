const { SlashCommandBuilder } = require('discord.js');
const { runRewardClaim, post } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim 3 random player cards and 1,000 coins every 24 hours'),

  async execute(interaction) {
    return runRewardClaim(
      interaction,
      () => post('/api/v1/players/' + interaction.user.id + '/rewards/daily', {}),
      'Daily reward'
    );
  },
};
