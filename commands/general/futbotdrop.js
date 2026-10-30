const { SlashCommandBuilder } = require('discord.js');
const { futbotApi, userIdOption, run, post } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder().setName('futbotdrop').setDescription('Create and collect timed FutBot card drops')
    .addSubcommand(s => s.setName('create').setDescription('Create a timed card drop').addUserOption(o => o.setName('owner').setDescription('Optional player with collection priority')))
    .addSubcommand(s => s.setName('status').setDescription('View a card drop').addStringOption(o => o.setName('drop-id').setDescription('Drop ID').setRequired(true)))
    .addSubcommand(s => s.setName('collect').setDescription('Collect an available card drop').addStringOption(o => o.setName('drop-id').setDescription('Drop ID').setRequired(true))),
  async execute(interaction) {
    const sub=interaction.options.getSubcommand(), uid=userIdOption(interaction);
    if(sub==='create') {
      const owner=interaction.options.getUser('owner');
      return run(interaction,()=>post('/api/v1/drops',{owner_id:owner?.id ?? null}),'Create card drop');
    }
    const id=interaction.options.getString('drop-id');
    if(sub==='status') return run(interaction,()=>futbotApi.request('/api/v1/drops/'+id),'Card drop');
    if(sub==='collect') return run(interaction,()=>post('/api/v1/drops/'+id+'/collect',{user_id:uid,username:interaction.user.username}),'Collect card drop');
  },
};
