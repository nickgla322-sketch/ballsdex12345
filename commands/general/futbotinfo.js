const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const VERSION='1.7.1';
const CREATOR='noobmaster';
const DESCRIPTION='Collect player cards from your Roblox soccer league, build your Starting 8 lineup, trade players, and manage your club.';

module.exports = {
  data: null,

  async execute(interaction) {
    const sub=interaction.options.getSubcommand();
    const embed=new EmbedBuilder().setColor(0x3498db).setFooter({text:'FutBot • '+VERSION});
    if(sub==='help') {
      embed.setTitle('⚽ SSP Help')
        .setDescription('Your league player collection, club, lineup, packs, and trading commands.')
        .addFields(
          {
            name:'Getting started',
            value:'/ssp player profile - View your FutBot profile\n/ssp player starter - Claim your starter pack\n/ssp claim - Claim a player card\n/ssp daily - Claim your daily rewards',
          },
          {
            name:'Players and lineup',
            value:'/ssp card search - Browse the player card catalog\n/ssp club search - View the players you own\n/ssp 8 show - View your Starting 8\n/ssp 8 add - Add a player to your lineup\n/ssp 8 remove or /ssp 8 clear - Remove lineup players\n/ssp 8 swap - Swap lineup slots\n/ssp 8 formation - Change your formation',
          },
          {
            name:'Packs and coins',
            value:'/ssp packs - Browse and buy player packs\n/ssp pack weight - View pack odds\n/ssp buy - Buy a player from the market\n/ssp sell - Sell one of your players\n/ssp economy leaderboard - View the coin or battle leaderboards',
          },
          {
            name:'Trading and matches',
            value:'/ssp trade - Start a player and coin trade with someone\n/ssp friendly - Challenge someone to a friendly match',
          },
          {
            name:'Other',
            value:'/ssp player secret - Redeem a secret code\n',
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
    }
    return interaction.reply({embeds:[embed],ephemeral:true});
  },
};
