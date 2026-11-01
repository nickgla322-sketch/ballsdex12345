const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { futbotApi, run } = require('../../utils/futbotDiscord');

module.exports = {
  data: null,

  async execute(interaction) {
    const sub=interaction.options.getSubcommand();
    const id=interaction.options.getString('drop-id');
    if(sub==='status') return run(interaction,()=>futbotApi.request('/api/v1/drops/'+id),'Card drop');
  },
};
