const { SlashCommandBuilder } = require('discord.js');
const { futbotApi, userIdOption, parseIdList, queryString, run, post } = require('../../utils/futbotDiscord');

const stats = ['battles_won','battles_played','battles_lost','battles_drawn','rounds_won','rounds_played','rounds_lost','rounds_drawn','coins','cards_dropped','cards_sold'];
const secrets = ['itscominghome','jogabonito','pineappleonpizza','fubball','theflyingdutchmen','mayonnaise'];
const tierChoices = [{name:'Common',value:'common'},{name:'Uncommon',value:'uncommon'},{name:'Rare',value:'rare'}];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('futbot').setDescription('FutBot player, cards, packs and economy')
    .addSubcommandGroup(g => g.setName('player').setDescription('Profiles and rewards')
      .addSubcommand(s => s.setName('profile').setDescription('View a player profile').addUserOption(o => o.setName('user').setDescription('Player')))
      .addSubcommand(s => s.setName('stats').setDescription('View player statistics').addUserOption(o => o.setName('user').setDescription('Player')))
      .addSubcommand(s => s.setName('inventory').setDescription('View a player inventory').addUserOption(o => o.setName('user').setDescription('Player')))
      .addSubcommand(s => s.setName('starter').setDescription('Claim your one-time starter pack'))
      .addSubcommand(s => s.setName('achievements').setDescription('View your achievements'))
      .addSubcommand(s => s.setName('equip-title').setDescription('Equip an unlocked title').addIntegerOption(o => o.setName('achievement-id').setDescription('Achievement ID').setRequired(true)))
      .addSubcommand(s => s.setName('secret').setDescription('Claim a secret card reward').addStringOption(o => o.setName('code').setDescription('Secret code').setRequired(true).addChoices(...secrets.map(v => ({name:v,value:v}))))))
    .addSubcommandGroup(g => g.setName('cards').setDescription('Search and inspect cards')
      .addSubcommand(s => s.setName('search').setDescription('Search the card catalog').addStringOption(o => o.setName('query').setDescription('Player name or card ID')).addIntegerOption(o => o.setName('limit').setDescription('Results (1-25)').setMinValue(1).setMaxValue(25)))
      .addSubcommand(s => s.setName('detail').setDescription('View a card').addIntegerOption(o => o.setName('card-id').setDescription('Card ID').setRequired(true)))
      .addSubcommand(s => s.setName('weight').setDescription('Check pack weight').addStringOption(o => o.setName('query').setDescription('Player name or card ID').setRequired(true)))
      .addSubcommand(s => s.setName('copies').setDescription('View your editions of a card').addIntegerOption(o => o.setName('card-id').setDescription('Card ID').setRequired(true)).addUserOption(o => o.setName('user').setDescription('Player'))))
    .addSubcommandGroup(g => g.setName('packs').setDescription('Pack catalog and openings')
      .addSubcommand(s => s.setName('catalog').setDescription('View available packs'))
      .addSubcommand(s => s.setName('owned').setDescription('View your unopened packs'))
      .addSubcommand(s => s.setName('buy').setDescription('Buy a pack').addIntegerOption(o => o.setName('pack-id').setDescription('Pack ID').setRequired(true).setMinValue(1).setMaxValue(4)))
      .addSubcommand(s => s.setName('open').setDescription('Open a pack').addIntegerOption(o => o.setName('pack-id').setDescription('Pack ID').setRequired(true).setMinValue(1).setMaxValue(4))))
    .addSubcommandGroup(g => g.setName('social').setDescription('Friends and requests')
      .addSubcommand(s => s.setName('friends').setDescription('View your friends'))
      .addSubcommand(s => s.setName('requests').setDescription('View incoming friend requests'))
      .addSubcommand(s => s.setName('add').setDescription('Send a friend request').addUserOption(o => o.setName('user').setDescription('Player').setRequired(true)))
      .addSubcommand(s => s.setName('accept').setDescription('Accept a friend request').addIntegerOption(o => o.setName('request-id').setDescription('Request ID').setRequired(true)))
      .addSubcommand(s => s.setName('decline').setDescription('Decline a friend request').addIntegerOption(o => o.setName('request-id').setDescription('Request ID').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a friend').addUserOption(o => o.setName('user').setDescription('Friend').setRequired(true))))
    .addSubcommandGroup(g => g.setName('economy').setDescription('Selling cards and rankings')
      .addSubcommand(s => s.setName('sell').setDescription('Sell cards from your inventory').addStringOption(o => o.setName('card-ids').setDescription('Card IDs, comma-separated').setRequired(true)))
      .addSubcommand(s => s.setName('leaderboard').setDescription('View a leaderboard').addStringOption(o => o.setName('stat').setDescription('Statistic').setRequired(true).addChoices(...stats.map(v => ({name:v.replace(/_/g,' '),value:v})))).addIntegerOption(o => o.setName('limit').setDescription('Entries (1-25)').setMinValue(1).setMaxValue(25))))
    .addSubcommandGroup(g => g.setName('tradeup').setDescription('Exchange five cards for a higher rarity card')
      .addSubcommand(s => s.setName('eligible').setDescription('View eligible cards').addStringOption(o => o.setName('tier').setDescription('Tier').setRequired(true).addChoices(...tierChoices)))
      .addSubcommand(s => s.setName('execute').setDescription('Trade up five inventory copies').addStringOption(o => o.setName('tier').setDescription('Tier').setRequired(true).addChoices(...tierChoices)).addStringOption(o => o.setName('row-ids').setDescription('Five inventory row IDs, comma-separated').setRequired(true)))),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const uid = userIdOption(interaction);
    const user = interaction.options.getUser('user');
    const base = '/api/v1/players/' + uid;
    const cardId = interaction.options.getInteger('card-id');

    if (group === 'player') {
      if (sub === 'profile') return run(interaction, () => futbotApi.request('/api/v1/players/' + (user?.id || uid)), 'Profile');
      if (sub === 'stats') return run(interaction, () => futbotApi.request('/api/v1/players/' + (user?.id || uid) + '/stats'), 'Stats');
      if (sub === 'inventory') return run(interaction, () => futbotApi.request('/api/v1/players/' + (user?.id || uid) + '/inventory'), 'Inventory');
      if (sub === 'starter') return run(interaction, () => post(base + '/starter-pack', {}), 'Starter pack');
      if (sub === 'achievements') return run(interaction, () => futbotApi.request(base + '/achievements'), 'Achievements');
      if (sub === 'equip-title') return run(interaction, () => post(base + '/title', {achievement_id:interaction.options.getInteger('achievement-id')}), 'Equip title');
      if (sub === 'secret') return run(interaction, () => post(base + '/secrets/' + interaction.options.getString('code'), {}), 'Secret reward');
    }
    if (group === 'cards') {
      if (sub === 'search') return run(interaction, () => futbotApi.request('/api/v1/cards' + queryString({search:interaction.options.getString('query'),limit:interaction.options.getInteger('limit') || 10})), 'Card search');
      if (sub === 'detail') return run(interaction, () => futbotApi.request('/api/v1/cards/' + cardId), 'Card detail');
      if (sub === 'weight') return run(interaction, () => futbotApi.request('/api/v1/cards/weight' + queryString({search:interaction.options.getString('query')})), 'Card weight');
      if (sub === 'copies') return run(interaction, () => futbotApi.request('/api/v1/players/' + (user?.id || uid) + '/cards/' + cardId + '/copies'), 'Card editions');
    }
    if (group === 'packs') {
      if (sub === 'catalog') return run(interaction, () => futbotApi.request('/api/v1/packs/catalog'), 'Pack catalog');
      if (sub === 'owned') return run(interaction, () => futbotApi.request(base + '/packs'), 'Your packs');
      if (sub === 'buy') return run(interaction, () => post('/api/v1/packs/buy', {user_id:uid,pack_id:interaction.options.getInteger('pack-id')}), 'Buy pack');
      if (sub === 'open') return run(interaction, () => post('/api/v1/packs/open', {user_id:uid,pack_id:interaction.options.getInteger('pack-id')}), 'Open pack');
    }
    if (group === 'social') {
      if (sub === 'friends') return run(interaction, () => futbotApi.request(base + '/friends'), 'Friends');
      if (sub === 'requests') return run(interaction, () => futbotApi.request(base + '/friend-requests'), 'Friend requests');
      if (sub === 'add') return run(interaction, () => post('/api/v1/friends/requests', {requester_id:uid,recipient_id:user.id}), 'Friend request');
      if (sub === 'accept' || sub === 'decline') return run(interaction, () => post('/api/v1/friends/requests/' + interaction.options.getInteger('request-id') + '/' + sub, {user_id:uid}), 'Friend request');
      if (sub === 'remove') return run(interaction, () => post('/api/v1/friends/remove', {user_id:uid,friend_id:user.id}), 'Remove friend');
    }
    if (group === 'economy') {
      if (sub === 'sell') return run(interaction, () => post('/api/v1/inventory/sell', {user_id:uid,card_ids:parseIdList(interaction.options.getString('card-ids'),'Card IDs')}), 'Sell cards');
      if (sub === 'leaderboard') return run(interaction, () => futbotApi.request('/api/v1/leaderboards/' + interaction.options.getString('stat') + queryString({limit:interaction.options.getInteger('limit') || 10})), 'Leaderboard');
    }
    if (group === 'tradeup') {
      const tier = interaction.options.getString('tier');
      if (sub === 'eligible') return run(interaction, () => futbotApi.request(base + '/trade-up/' + tier), 'Trade-up eligible cards');
      if (sub === 'execute') return run(interaction, () => post('/api/v1/trade-up', {user_id:uid,tier,inventory_row_ids:parseIdList(interaction.options.getString('row-ids'),'Inventory row IDs')}), 'Trade-up');
    }
  },
};
