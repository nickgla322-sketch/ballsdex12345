const { SlashCommandBuilder } = require('discord.js');
const { futbotApi, userIdOption, queryString, run, post } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder().setName('futbotmarket').setDescription('Browse and manage the FutBot marketplace')
    .addSubcommand(s => s.setName('browse').setDescription('Browse active card listings').addStringOption(o => o.setName('search').setDescription('Search by player or card')).addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(0)))
    .addSubcommand(s => s.setName('list').setDescription('List one of your card editions').addIntegerOption(o => o.setName('card-id').setDescription('Card ID').setRequired(true)).addIntegerOption(o => o.setName('edition').setDescription('Edition number').setRequired(true).setMinValue(1)).addIntegerOption(o => o.setName('price').setDescription('Price in coins').setRequired(true).setMinValue(1)).addIntegerOption(o => o.setName('hours').setDescription('Listing duration in hours').setRequired(true).setMinValue(1).setMaxValue(720)))
    .addSubcommand(s => s.setName('buy').setDescription('Buy a marketplace listing').addIntegerOption(o => o.setName('listing-id').setDescription('Listing ID').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('cancel').setDescription('Cancel your active listing').addIntegerOption(o => o.setName('listing-id').setDescription('Listing ID').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('mine').setDescription('View your active listings')),
  async execute(interaction) {
    const sub=interaction.options.getSubcommand(), uid=userIdOption(interaction);
    if(sub==='browse') return run(interaction,()=>futbotApi.request('/api/v1/market/listings'+queryString({search:interaction.options.getString('search'),page:interaction.options.getInteger('page') || 0,page_size:5})),'Marketplace');
    if(sub==='list') return run(interaction,()=>post('/api/v1/market/listings',{user_id:uid,card_id:interaction.options.getInteger('card-id'),edition:interaction.options.getInteger('edition'),price:interaction.options.getInteger('price'),duration_hours:interaction.options.getInteger('hours')}),'Create listing');
    if(sub==='buy') return run(interaction,()=>post('/api/v1/market/listings/'+interaction.options.getInteger('listing-id')+'/buy',{buyer_id:uid}),'Buy listing');
    if(sub==='cancel') return run(interaction,()=>post('/api/v1/market/listings/'+interaction.options.getInteger('listing-id')+'/cancel',{seller_id:uid}),'Cancel listing');
    if(sub==='mine') return run(interaction,()=>futbotApi.request('/api/v1/players/'+uid+'/market/listings'),'Your listings');
  },
};
