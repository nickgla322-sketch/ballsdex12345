const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { futbotApi, userIdOption, run } = require('../../utils/futbotDiscord');

const VERSION='1.7.1';
const CREATOR='noobmaster';
const DESCRIPTION='Collect football player cards, build five-card decks, and battle other players using your favourite footballers.';

module.exports = {
  data: new SlashCommandBuilder().setName('futbotinfo').setDescription('FutBot help and information')
    .addSubcommand(s=>s.setName('help').setDescription('Show FutBot commands and how to get started'))
    .addSubcommand(s=>s.setName('about').setDescription('About FutBot'))
    .addSubcommand(s=>s.setName('version').setDescription('Show the FutBot version'))
    .addSubcommand(s=>s.setName('achievements').setDescription('View your achievements').addUserOption(o=>o.setName('user').setDescription('Player to inspect'))),
  async execute(interaction) {
    const sub=interaction.options.getSubcommand();
    if(sub==='achievements') {
      const uid=interaction.options.getUser('user')?.id || userIdOption(interaction);
      return run(interaction,()=>futbotApi.request('/api/v1/players/'+uid+'/achievements'),'Achievements');
    }
    const embed=new EmbedBuilder().setColor(0x3498db).setFooter({text:'FutBot • '+VERSION});
    if(sub==='help') {
      embed.setTitle('⚽ FutBot Help').setDescription('Collect football cards, build decks, and compete with other players.')
        .addFields(
          {name:'Getting started',value:'/futbot player register - Create your profile\n/futbot player starter - Claim your starter cards\n/futbot player daily - Claim daily coins and card choices'},
          {name:'Collection',value:'/futbot cards search - Search cards\n/futbot player inventory - View your cards\n/futbotimage card - View card artwork\n/futbotimage minted - Generate your edition image'},
          {name:'Packs and economy',value:'/futbot packs catalog - Browse packs\n/futbot packs buy and /futbot packs open\n/futbot economy sell - Sell cards'},
          {name:'Decks and battles',value:'/futbot decks save - Save a five-card deck\n/futbotbattle challenge - Challenge a player\n/futbotbattle status - Check a battle'},
          {name:'Social and trading',value:'/futbot social friends - View friends\n/futbottrade offer - One-for-one trade\n/futbotexchange create - Multi-card/coin exchange\n/futbotmarket list - List a card'},
          {name:'More',value:'Use /futbotdrop for card drops, /futbot tradeup for trade-ups.'}
        );
    } else if(sub==='about') {
      embed.setTitle('About FutBot').addFields(
        {name:'Version',value:VERSION,inline:true},
        {name:'Creator',value:CREATOR,inline:true},
        {name:'Description',value:DESCRIPTION}
      );
    } else if(sub==='version') {
      embed.setTitle('FutBot Version').setDescription('Current version: **'+VERSION+'**');
    } else if(sub==='changelog') {
      embed.setTitle('FutBot Changelog').setDescription(CHANGELOG.map(item=>'• '+item).join('\n'));
    }
    return interaction.reply({embeds:[embed],ephemeral:true});
  },
};
