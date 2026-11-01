const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { futbotApi, run } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder().setName('futbotdrop').setDescription('Create and collect timed FutBot card drops').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('status').setDescription('View a card drop').addStringOption(o => o.setName('drop-id').setDescription('Drop ID').setRequired(true)))
,
  async execute(interaction) {
    const sub=interaction.options.getSubcommand();
    const id=interaction.options.getString('drop-id');
    if(sub==='status') return run(interaction,()=>futbotApi.request('/api/v1/drops/'+id),'Card drop');
  },
};
