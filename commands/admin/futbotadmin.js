const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { userIdOption, run, post } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder().setName('futbotadmin').setDescription('Administer FutBot players and cards').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('give-coins').setDescription('Give coins to a player').addUserOption(o => o.setName('user').setDescription('Player').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Coins to give').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('give-card').setDescription('Give a card to a player').addUserOption(o => o.setName('user').setDescription('Player').setRequired(true)).addIntegerOption(o => o.setName('card-id').setDescription('Card ID').setRequired(true)))
    .addSubcommand(s => s.setName('remove-card').setDescription('Remove a card from a player').addUserOption(o => o.setName('user').setDescription('Player').setRequired(true)).addIntegerOption(o => o.setName('card-id').setDescription('Card ID').setRequired(true)))
    .addSubcommand(s => s.setName('expire-market').setDescription('Expire overdue marketplace listings')),
  async execute(interaction) {
    const sub=interaction.options.getSubcommand(), admin_id=userIdOption(interaction), user=interaction.options.getUser('user');
    if(sub==='give-coins') return run(interaction,()=>post('/api/v1/admin/coins',{admin_id,user_id:user.id,amount:interaction.options.getInteger('amount')}),'Give coins');
    if(sub==='give-card') return run(interaction,()=>post('/api/v1/admin/cards/give',{admin_id,user_id:user.id,card_id:interaction.options.getInteger('card-id')}),'Give card');
    if(sub==='remove-card') return run(interaction,()=>post('/api/v1/admin/cards/remove',{admin_id,user_id:user.id,card_id:interaction.options.getInteger('card-id')}),'Remove card');
    if(sub==='expire-market') return run(interaction,()=>post('/api/v1/market/expire',{}),'Expire marketplace listings');
  },
};
