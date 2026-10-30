const { SlashCommandBuilder } = require('discord.js');
const { futbotApi, userIdOption, run, post } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder().setName('futbottrade').setDescription('Trade cards with another FutBot player')
    .addSubcommand(s => s.setName('offer').setDescription('Offer a one-for-one card trade').addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true)).addIntegerOption(o => o.setName('your-card').setDescription('Your card ID').setRequired(true)).addIntegerOption(o => o.setName('their-card').setDescription('Card ID you want').setRequired(true)))
    .addSubcommand(s => s.setName('status').setDescription('View a trade offer').addStringOption(o => o.setName('trade-id').setDescription('Trade ID').setRequired(true)))
    .addSubcommand(s => s.setName('accept').setDescription('Accept a trade offer').addStringOption(o => o.setName('trade-id').setDescription('Trade ID').setRequired(true)))
    .addSubcommand(s => s.setName('decline').setDescription('Decline a trade offer').addStringOption(o => o.setName('trade-id').setDescription('Trade ID').setRequired(true))),
  async execute(interaction) {
    const sub=interaction.options.getSubcommand(), uid=userIdOption(interaction), id=interaction.options.getString('trade-id');
    if(sub==='offer') return run(interaction,()=>post('/api/v1/trades',{sender_id:uid,recipient_id:interaction.options.getUser('user').id,sender_card_id:interaction.options.getInteger('your-card'),recipient_card_id:interaction.options.getInteger('their-card')}),'Trade offer');
    if(sub==='status') return run(interaction,()=>futbotApi.request('/api/v1/trades/'+id),'Trade status');
    if(sub==='accept'||sub==='decline') return run(interaction,()=>post('/api/v1/trades/'+id+'/'+sub,{user_id:uid}),'Trade '+sub);
  },
};
