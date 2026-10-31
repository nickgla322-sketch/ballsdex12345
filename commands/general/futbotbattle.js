const { SlashCommandBuilder } = require('discord.js');
const { futbotApi, userIdOption, run, post } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder().setName('futbotbattle').setDescription('Play FutBot card battles')
    .addSubcommand(s => s.setName('challenge').setDescription('Challenge another registered player').addUserOption(o => o.setName('user').setDescription('Opponent').setRequired(true)))
    .addSubcommand(s => s.setName('status').setDescription('View a battle').addStringOption(o => o.setName('battle-id').setDescription('Battle ID').setRequired(true)))
    .addSubcommand(s => s.setName('accept').setDescription('Accept a battle challenge').addStringOption(o => o.setName('battle-id').setDescription('Battle ID').setRequired(true)))
    .addSubcommand(s => s.setName('decline').setDescription('Decline a battle challenge').addStringOption(o => o.setName('battle-id').setDescription('Battle ID').setRequired(true)))
    .addSubcommand(s => s.setName('lineup').setDescription('Lock in your saved eight-player lineup').addStringOption(o => o.setName('battle-id').setDescription('Battle ID').setRequired(true)))
    .addSubcommand(s => s.setName('action').setDescription('Choose your battle stat').addStringOption(o => o.setName('battle-id').setDescription('Battle ID').setRequired(true)).addStringOption(o => o.setName('stat').setDescription('Attack, defense or speed').setRequired(true).addChoices({name:'Attack',value:'attack'},{name:'Defense',value:'defense'},{name:'Speed',value:'speed'})))
    .addSubcommand(s => s.setName('card').setDescription('Choose an unused card from your locked lineup').addStringOption(o => o.setName('battle-id').setDescription('Battle ID').setRequired(true)).addIntegerOption(o => o.setName('card-id').setDescription('Card ID from your selected deck').setRequired(true)))
    .addSubcommand(s => s.setName('next').setDescription('Ready up for the next round').addStringOption(o => o.setName('battle-id').setDescription('Battle ID').setRequired(true)))
    .addSubcommand(s => s.setName('draw').setDescription('Offer or accept a draw').addStringOption(o => o.setName('battle-id').setDescription('Battle ID').setRequired(true)))
    .addSubcommand(s => s.setName('surrender').setDescription('Surrender the battle').addStringOption(o => o.setName('battle-id').setDescription('Battle ID').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const id = interaction.options.getString('battle-id');
    const uid = userIdOption(interaction);
    if (sub === 'challenge') return run(interaction, () => post('/api/v1/battles', {player1_id:uid,player2_id:interaction.options.getUser('user').id}), 'Battle challenge');
    if (sub === 'status') return run(interaction, () => futbotApi.request('/api/v1/battles/' + id), 'Battle status');
    if (sub === 'accept' || sub === 'decline') return run(interaction, () => post('/api/v1/battles/' + id + '/' + sub, {user_id:uid}), 'Battle ' + sub);
    if (sub === 'lineup') return run(interaction, () => post('/api/v1/battles/' + id + '/lineup', {user_id:uid}), 'Battle lineup');
    if (sub === 'action') return run(interaction, () => post('/api/v1/battles/' + id + '/action', {user_id:uid,action:interaction.options.getString('stat')}), 'Battle action');
    if (sub === 'card') return run(interaction, () => post('/api/v1/battles/' + id + '/card', {user_id:uid,card_id:interaction.options.getInteger('card-id')}), 'Battle card');
    if (sub === 'next' || sub === 'draw' || sub === 'surrender') return run(interaction, () => post('/api/v1/battles/' + id + '/' + sub, {user_id:uid}), 'Battle ' + sub);
  },
};
