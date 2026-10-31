const { SlashCommandBuilder } = require('discord.js');
const { runRewardClaim, post } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim 1 random player card every 30 minutes'),

  async execute(interaction) {
    return runRewardClaim(
      interaction,
      () => post('/api/v1/players/' + interaction.user.id + '/rewards/quick', {}),
      'Quick reward'
    );
  },
};
