const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { run } = require('../../utils/futbotDiscord');

const VERSION='1.7.1';
const CREATOR='noobmaster';
const DESCRIPTION='Collect football player cards, build five-card decks, and battle other players using your favourite footballers.';

module.exports = {
  data: new SlashCommandBuilder().setName('futbotinfo').setDescription('FutBot help and information')
    .addSubcommand(s=>s.setName('help').setDescription('Show FutBot commands and how to get started'))
    .addSubcommand(s=>s.setName('about').setDescription('About FutBot'))
    .addSubcommand(s=>s.setName('version').setDescription('Show the FutBot version')),
  async execute(interaction) {
    const sub=interaction.options.getSubcommand();
    const embed=new EmbedBuilder().setColor(0x3498db).setFooter({text:'FutBot • '+VERSION});
    if(sub==='help') {
      embed.setTitle('⚽ FutBot Help')
        .setDescription('Your league player collection, club, lineup, packs, and trading commands.')
        .addFields(
          {
            name:'Getting started',
            value:'/futbot player profile - View your FutBot profile\n/futbot player starter - Claim your starter pack\n/claim - Claim a player card\n/daily - Claim your daily rewards',
          },
          {
            name:'Players and lineup',
            value:'/card player search - Browse the player card catalog\n/club search - View the players you own\n/8 show - View your Starting 8\n/8 add - Add a player to your lineup\n/8 remove slot or /8 remove all - Remove lineup players\n/8 swap - Swap lineup slots\n/8 formation - Change your formation',
          },
          {
            name:'Packs and coins',
            value:'/pack - Browse and buy player packs\n/futbot pack weight - View pack odds\n/buy - Buy a player from the market\n/sell - Sell one of your players\n/futbot economy leaderboard - View the coin or battle leaderboards',
          },
          {
            name:'Trading and matches',
            value:'/trade - Start a player and coin trade with someone\n/friendly - Challenge someone to a friendly match',
          },
          {
            name:'League commands',
            value:'/division - Browse divisions and teams\n/teaminfo - View team information',
          },
          {
            name:'Other',
            value:'/futbot player secret - Redeem a secret code\n/futbotdrop status - Check a card drop\n/futbotstatus - Check the FutBot API connection',
          }
        )
        .setFooter({ text:'Use the command options in Discord for required details.' });
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
