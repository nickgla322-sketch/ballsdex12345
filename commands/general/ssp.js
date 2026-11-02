const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const lineup = require('./8');
const packs = require('./pack');
const futbot = require('./futbot');
const cards = require('./card');
const club = require('./players');
const friendly = require('./friendly');
const claim = require('./claim');
const daily = require('./daily');
const buy = require('./buy');
const sell = require('./sell');
const trade = require('./trade');
const info = require('./futbotinfo');
const admin = require('../admin/futbotadmin');

const secrets = ['itscominghome','jogabonito','pineappleonpizza','fubball','theflyingdutchmen','mayonnaise'];
const stats = ['battles_won','battles_played','battles_lost','battles_drawn','rounds_won','rounds_played','rounds_lost','rounds_drawn','coins','cards_dropped','cards_sold'];
const positions = ['GK','CB','LB','RB','CDM','CM','CAM','LW','RW','ST'];
function proxy(interaction, group, sub) {
  const options = new Proxy(interaction.options, { get(t,p) {
    if (p === 'getSubcommandGroup') return () => group;
    if (p === 'getSubcommand') return () => sub;
    const v = Reflect.get(t,p,t); return typeof v === 'function' ? v.bind(t) : v;
  }});
  return new Proxy(interaction, { get(t,p) {
    if (p === 'options') return options;
    const v = Reflect.get(t,p,t); return typeof v === 'function' ? v.bind(t) : v;
  }});
}
module.exports = {
 data: new SlashCommandBuilder().setName('ssp').setDescription('Soccer Simulator Pro commands')
  .addSubcommandGroup(g=>g.setName('8').setDescription('Manage your Starting 8')
   .addSubcommand(s=>s.setName('show').setDescription('Show your Starting 8'))
   .addSubcommand(s=>s.setName('add').setDescription('Add a player').addStringOption(o=>o.setName('player').setDescription('Player name').setRequired(true)).addIntegerOption(o=>o.setName('slot').setDescription('Slot 1-8').setRequired(true).setMinValue(1).setMaxValue(8)))
   .addSubcommand(s=>s.setName('remove').setDescription('Remove a player from a slot').addIntegerOption(o=>o.setName('number').setDescription('Slot 1-8').setRequired(true).setMinValue(1).setMaxValue(8)))
   .addSubcommand(s=>s.setName('clear').setDescription('Clear your Starting 8'))
   .addSubcommand(s=>s.setName('swap').setDescription('Swap two lineup slots').addIntegerOption(o=>o.setName('slot1').setDescription('First slot').setRequired(true).setMinValue(1).setMaxValue(8)).addIntegerOption(o=>o.setName('slot2').setDescription('Second slot').setRequired(true).setMinValue(1).setMaxValue(8)))
   .addSubcommand(s=>s.setName('formation').setDescription('Change your formation')))
  .addSubcommandGroup(g=>g.setName('player').setDescription('Player profiles')
   .addSubcommand(s=>s.setName('profile').setDescription('View a player profile').addUserOption(o=>o.setName('user').setDescription('Player')))
   .addSubcommand(s=>s.setName('starter').setDescription('Claim your starter pack'))
   .addSubcommand(s=>s.setName('secret').setDescription('Redeem a secret code').addStringOption(o=>o.setName('code').setDescription('Secret code').setRequired(true).addChoices(...secrets.map(x=>({name:x,value:x}))))))
  .addSubcommandGroup(g=>g.setName('card').setDescription('Browse player cards')
   .addSubcommand(s=>s.setName('search').setDescription('Browse player cards').addStringOption(o=>o.setName('category').setDescription('Card category').addChoices({name:'Bronze',value:'bronze'},{name:'Silver',value:'silver'},{name:'Gold',value:'gold'},{name:'Special',value:'special'})).addStringOption(o=>o.setName('position').setDescription('Position').addChoices(...positions.map(x=>({name:x,value:x}))))))
  .addSubcommandGroup(g=>g.setName('club').setDescription('Your player collection').addSubcommand(s=>s.setName('search').setDescription('View players you own')))
  .addSubcommandGroup(g=>g.setName('pack').setDescription('Player pack odds').addSubcommand(s=>s.setName('weight').setDescription('View pack odds')))
  .addSubcommandGroup(g=>g.setName('economy').setDescription('Player economy').addSubcommand(s=>s.setName('leaderboard').setDescription('View a leaderboard').addStringOption(o=>o.setName('stat').setDescription('Statistic').setRequired(true).addChoices(...stats.map(x=>({name:x.replace(/_/g,' '),value:x})))).addIntegerOption(o=>o.setName('limit').setDescription('Entries 1-25').setMinValue(1).setMaxValue(25))))
  .addSubcommandGroup(g=>g.setName('admin').setDescription('Administer the SSP player catalog')
   .addSubcommand(s=>s.setName('give-coins').setDescription('Give coins to a player').addUserOption(o=>o.setName('user').setDescription('Player').setRequired(true)).addIntegerOption(o=>o.setName('amount').setDescription('Coins to give').setRequired(true).setMinValue(1)))
   .addSubcommand(s=>s.setName('give-card').setDescription('Give a catalog card to a player').addUserOption(o=>o.setName('user').setDescription('Player').setRequired(true)).addIntegerOption(o=>o.setName('card-id').setDescription('Card ID').setRequired(true).setMinValue(1)))
   .addSubcommand(s=>s.setName('remove-player-card').setDescription('Remove a card from a player inventory').addUserOption(o=>o.setName('user').setDescription('Player').setRequired(true)).addIntegerOption(o=>o.setName('card-id').setDescription('Card ID').setRequired(true).setMinValue(1)))
   .addSubcommand(s=>s.setName('create-card').setDescription('Create a catalog card')
    .addIntegerOption(o=>o.setName('card-id').setDescription('Unique card ID').setRequired(true).setMinValue(1))
    .addStringOption(o=>o.setName('name').setDescription('Player/card name').setRequired(true).setMaxLength(100))
    .addIntegerOption(o=>o.setName('attack').setDescription('Attack stat').setRequired(true).setMinValue(0).setMaxValue(99))
    .addIntegerOption(o=>o.setName('defense').setDescription('Defense stat').setRequired(true).setMinValue(0).setMaxValue(99))
    .addIntegerOption(o=>o.setName('speed').setDescription('Speed stat').setRequired(true).setMinValue(0).setMaxValue(99))
    .addIntegerOption(o=>o.setName('overall').setDescription('Overall rating').setRequired(true).setMinValue(0).setMaxValue(99))
    .addStringOption(o=>o.setName('rarity').setDescription('Card rarity').setRequired(true).setMaxLength(40))
    .addStringOption(o=>o.setName('type').setDescription('Card type').setRequired(true).setMaxLength(40))
    .addAttachmentOption(o=>o.setName('image').setDescription('Card image').setRequired(true))
    .addStringOption(o=>o.setName('player-id').setDescription('Player identifier').setMaxLength(100))
    .addStringOption(o=>o.setName('height').setDescription('Player height').setMaxLength(30))
    .addStringOption(o=>o.setName('club').setDescription('Club').setMaxLength(100))
    .addStringOption(o=>o.setName('position').setDescription('Position').setMaxLength(40))
    .addStringOption(o=>o.setName('league').setDescription('League').setMaxLength(100))
    .addStringOption(o=>o.setName('nation').setDescription('Nation').setMaxLength(100)))
   .addSubcommand(s=>s.setName('replace-card').setDescription('Replace catalog card details or image')
    .addIntegerOption(o=>o.setName('card-id').setDescription('Unique card ID').setRequired(true).setMinValue(1))
    .addStringOption(o=>o.setName('name').setDescription('Player/card name').setMaxLength(100))
    .addIntegerOption(o=>o.setName('attack').setDescription('Attack stat').setMinValue(0).setMaxValue(99))
    .addIntegerOption(o=>o.setName('defense').setDescription('Defense stat').setMinValue(0).setMaxValue(99))
    .addIntegerOption(o=>o.setName('speed').setDescription('Speed stat').setMinValue(0).setMaxValue(99))
    .addIntegerOption(o=>o.setName('overall').setDescription('Overall rating').setMinValue(0).setMaxValue(99))
    .addStringOption(o=>o.setName('rarity').setDescription('Card rarity').setMaxLength(40))
    .addStringOption(o=>o.setName('type').setDescription('Card type').setMaxLength(40))
    .addStringOption(o=>o.setName('player-id').setDescription('Player identifier').setMaxLength(100))
    .addStringOption(o=>o.setName('height').setDescription('Player height').setMaxLength(30))
    .addStringOption(o=>o.setName('club').setDescription('Club').setMaxLength(100))
    .addStringOption(o=>o.setName('position').setDescription('Position').setMaxLength(40))
    .addStringOption(o=>o.setName('league').setDescription('League').setMaxLength(100))
    .addStringOption(o=>o.setName('nation').setDescription('Nation').setMaxLength(100))
    .addAttachmentOption(o=>o.setName('image').setDescription('Replacement image')))
   .addSubcommand(s=>s.setName('remove-card').setDescription('Permanently remove a catalog card').addIntegerOption(o=>o.setName('card-id').setDescription('Catalog card ID').setRequired(true).setMinValue(1)))
   .addSubcommand(s=>s.setName('import-json').setDescription('Import 1-50 cards from a JSON file').addAttachmentOption(o=>o.setName('file').setDescription('JSON card file').setRequired(true)))
   .addSubcommand(s=>s.setName('wipe-cards').setDescription('Delete every player card from the catalog').addStringOption(o=>o.setName('confirmation').setDescription('Type WIPE ALL CARDS exactly').setRequired(true).setMaxLength(30))))
  .addSubcommand(s=>s.setName('balance').setDescription('Check your coin balance'))
  .addSubcommand(s=>s.setName('help').setDescription('Show SSP commands'))
  .addSubcommand(s=>s.setName('packs').setDescription('Browse and buy player packs'))
  .addSubcommand(s=>s.setName('friendly').setDescription('Challenge someone').addUserOption(o=>o.setName('opponent').setDescription('Opponent').setRequired(true)))
  .addSubcommand(s=>s.setName('claim').setDescription('Claim a player card'))
  .addSubcommand(s=>s.setName('daily').setDescription('Claim daily rewards'))
  .addSubcommand(s=>s.setName('buy').setDescription('Buy a player').addStringOption(o=>o.setName('player').setDescription('Player').setRequired(true).setMaxLength(100)))
  .addSubcommand(s=>s.setName('sell').setDescription('QuickSell a player').addStringOption(o=>o.setName('player').setDescription('Player').setRequired(true).setMaxLength(100)))
  .addSubcommand(s=>s.setName('trade').setDescription('Trade cards and coins').addUserOption(o=>o.setName('user').setDescription('Player to trade with').setRequired(true))),
 async execute(i,client) {
  const g=i.options.getSubcommandGroup(false), s=i.options.getSubcommand();
  if(g==='8') return lineup.execute(proxy(i, s==='remove'||s==='clear'?'remove':null, s==='remove'?'slot':s==='clear'?'all':s));
  if(g==='player') return futbot.execute(proxy(i,'player',s));
  if(g==='card'&&s==='search') return cards.execute(i,client);
  if(g==='club') return club.execute(i,client);
  if(g==='pack'||g==='economy') return futbot.execute(proxy(i,g,s));
  if(!g && s==='balance') return futbot.execute(proxy(i,'economy','balance'));
  if(g==='admin') {
   if(!i.memberPermissions?.has(PermissionFlagsBits.Administrator)) return i.reply({content:'You need Administrator permissions to use SSP admin commands.',ephemeral:false});
   return admin.execute(proxy(i,null,s));
  }
  if(!g && s==='help') return info.execute(proxy(i,null,'help'));
  return ({packs:()=>packs.execute(i,client),friendly:()=>friendly.execute(i,client),claim:()=>claim.execute(i,client),daily:()=>daily.execute(i,client),buy:()=>buy.execute(i,client),sell:()=>sell.execute(i,client),trade:()=>trade.execute(i,client)})[s]?.();
 },
 handleSelect:(...a)=>packs.handleSelect(...a),
 handleButton:(...a)=>packs.handleButton(...a),
};
