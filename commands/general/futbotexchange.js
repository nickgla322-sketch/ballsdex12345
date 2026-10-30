const { SlashCommandBuilder } = require('discord.js');
const { futbotApi, userIdOption, parseIdList, run, post, put } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder().setName('futbotexchange').setDescription('Create and manage advanced card/coin exchanges')
    .addSubcommand(s => s.setName('create').setDescription('Start an exchange with another player').addUserOption(o => o.setName('user').setDescription('Other player').setRequired(true)))
    .addSubcommand(s => s.setName('status').setDescription('View an exchange').addStringOption(o => o.setName('session-id').setDescription('Session ID').setRequired(true)))
    .addSubcommand(s => s.setName('offer').setDescription('Replace your cards and coin offer').addStringOption(o => o.setName('session-id').setDescription('Session ID').setRequired(true)).addStringOption(o => o.setName('card-ids').setDescription('Card IDs separated by commas')).addIntegerOption(o => o.setName('coins').setDescription('Coins to offer').setMinValue(0)))
    .addSubcommand(s => s.setName('lock').setDescription('Lock your exchange offer').addStringOption(o => o.setName('session-id').setDescription('Session ID').setRequired(true)))
    .addSubcommand(s => s.setName('confirm').setDescription('Confirm a mutually locked exchange').addStringOption(o => o.setName('session-id').setDescription('Session ID').setRequired(true)))
    .addSubcommand(s => s.setName('cancel').setDescription('Cancel an exchange').addStringOption(o => o.setName('session-id').setDescription('Session ID').setRequired(true))),
  async execute(interaction) {
    const sub=interaction.options.getSubcommand(), uid=userIdOption(interaction), id=interaction.options.getString('session-id');
    if(sub==='create') return run(interaction,()=>post('/api/v1/exchanges',{player1_id:uid,player2_id:interaction.options.getUser('user').id}),'Create exchange');
    if(sub==='status') return run(interaction,()=>futbotApi.request('/api/v1/exchanges/'+id),'Exchange status');
    if(sub==='offer') {
      const raw=interaction.options.getString('card-ids');
      const card_ids=raw ? parseIdList(raw,'Card IDs') : [];
      return run(interaction,()=>put('/api/v1/exchanges/'+id+'/offer',{user_id:uid,card_ids,coins:interaction.options.getInteger('coins') || 0}),'Update exchange offer');
    }
    if(sub==='lock'||sub==='confirm'||sub==='cancel') return run(interaction,()=>post('/api/v1/exchanges/'+id+'/'+sub,{user_id:uid}),'Exchange '+sub);
  },
};
