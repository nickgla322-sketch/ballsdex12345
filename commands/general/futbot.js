const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { futbotApi, userIdOption, parseIdList, queryString, run, post } = require('../../utils/futbotDiscord');

const stats = ['battles_won','battles_played','battles_lost','battles_drawn','rounds_won','rounds_played','rounds_lost','rounds_drawn','coins','cards_dropped','cards_sold'];
const secrets = ['itscominghome','jogabonito','pineappleonpizza','fubball','theflyingdutchmen','mayonnaise'];
const tierChoices = [{name:'Common',value:'common'},{name:'Uncommon',value:'uncommon'},{name:'Rare',value:'rare'}];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('futbot').setDescription('FutBot player, cards, packs and economy')
    .addSubcommandGroup(g => g.setName('player').setDescription('Profiles and rewards')
      .addSubcommand(s => s.setName('profile').setDescription('View a player profile').addUserOption(o => o.setName('user').setDescription('Player')))
      .addSubcommand(s => s.setName('starter').setDescription('Claim your one-time starter pack'))
      .addSubcommand(s => s.setName('secret').setDescription('Claim a secret card reward').addStringOption(o => o.setName('code').setDescription('Secret code').setRequired(true).addChoices(...secrets.map(v => ({name:v,value:v}))))))
    .addSubcommandGroup(g => g.setName('pack').setDescription('Player packs and odds')
      .addSubcommand(s => s.setName('weight').setDescription('View overall odds for Bronze, Silver, or Gold packs')))
    .addSubcommandGroup(g => g.setName('economy').setDescription('Selling cards and rankings')
      .addSubcommand(s => s.setName('leaderboard').setDescription('View a leaderboard').addStringOption(o => o.setName('stat').setDescription('Statistic').setRequired(true).addChoices(...stats.map(v => ({name:v.replace(/_/g,' '),value:v})))).addIntegerOption(o => o.setName('limit').setDescription('Entries (1-25)').setMinValue(1).setMaxValue(25))))
    .addSubcommandGroup(g => g.setName('tradeup').setDescription('Exchange five cards for a higher rarity card')
      .addSubcommand(s => s.setName('execute').setDescription('Trade up five inventory copies').addStringOption(o => o.setName('tier').setDescription('Tier').setRequired(true).addChoices(...tierChoices)).addStringOption(o => o.setName('row-ids').setDescription('Five inventory row IDs, comma-separated').setRequired(true)))),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const uid = userIdOption(interaction);
    const user = interaction.options.getUser('user');
    const base = '/api/v1/players/' + uid;

    if (group === 'player') {
      if (sub === 'profile') return run(interaction, () => futbotApi.request('/api/v1/players/' + (user?.id || uid)), 'Profile');
      if (sub === 'starter') return run(interaction, () => post(base + '/starter-pack', {}), 'Starter pack');
      if (sub === 'secret') return run(interaction, () => post(base + '/secrets/' + interaction.options.getString('code'), {}), 'Secret reward');
    }
    if (group === 'pack' && sub === 'weight') {
        const menu = new StringSelectMenuBuilder()
          .setCustomId('futbot_pack_weight:' + interaction.user.id)
          .setPlaceholder('Choose a pack to view its odds')
          .addOptions(
            { label: 'Bronze Pack', value: 'bronze', description: '45-64 overall players' },
            { label: 'Silver Pack', value: 'silver', description: '65-74 overall players' },
            { label: 'Gold Pack', value: 'gold', description: '75-99 overall players' },
            { label: '/claim + /daily', value: 'claim_daily', description: '1 claim card + 3 daily cards + 1,000 coins' },
          );
        const row = new ActionRowBuilder().addComponents(menu);
        const message = await interaction.reply({
          content: 'Choose a pack to see the chance of receiving each player overall.',
          components: [row],
          flags: MessageFlags.Ephemeral,
          fetchReply: true,
        });
        const collector = message.createMessageComponentCollector({
          time: 120000,
          filter: component => component.user.id === interaction.user.id && component.customId === 'futbot_pack_weight:' + interaction.user.id,
        });
        collector.on('collect', async component => {
          await component.deferUpdate();
          try {
            const tier = component.values[0];
            const isReward = tier === 'claim_daily';
            const response = await futbotApi.request(isReward ? '/api/v1/rewards/odds' : '/api/v1/packs/odds/' + tier, { method: 'GET' });
            const data = response?.data ?? response;
            const lines = (data.overalls || []).map(item => {
              const count = Number(item.count || 0);
              const players = count === 1 ? '1 player' : count.toLocaleString() + ' players';
              return '**' + item.overall + ' OVR**  •  **' +
                Number(item.percentage || 0).toFixed(2) + '%**  •  ' + players;
            });
            const embed = new EmbedBuilder()
              .setTitle(isReward ? '/claim + /daily Card Odds' : (tier.charAt(0).toUpperCase() + tier.slice(1)) + ' Pack Odds')
              .setColor(0x5865f2)
              .setDescription(lines.length
                ? '**' + (isReward ? 'Chance per card' : 'Overall odds') + '**\n\n' + lines.join('\n')
                : 'No eligible players were found for this pack.')
              .setFooter({ text: (isReward ? 'Each card uses these base odds. /daily selects 3 cards without repeats, so later draws can shift slightly. ' : 'Based on ') + Number(data.total_players || 0).toLocaleString() + ' eligible players in the current card catalog. Odds may change when the catalog changes.' });
            await component.editReply({ content: null, embeds: [embed], components: [row] });
          } catch (error) {
            await component.followUp({ content: 'Could not load pack odds: ' + String(error.message || 'Unknown API error').slice(0, 1200), flags: MessageFlags.Ephemeral });
          }
        });
        collector.on('end', async () => {
          try { await interaction.editReply({ components: [new ActionRowBuilder().addComponents(menu.setDisabled(true))] }); } catch {}
        });
        return;
    }

    if (group === 'economy') {
      if (sub === 'leaderboard') return run(interaction, () => futbotApi.request('/api/v1/leaderboards/' + interaction.options.getString('stat') + queryString({limit:interaction.options.getInteger('limit') || 10})), 'Leaderboard');
    }
    if (group === 'tradeup') {
      const tier = interaction.options.getString('tier');
      if (sub === 'execute') return run(interaction, () => post('/api/v1/trade-up', {user_id:uid,tier,inventory_row_ids:parseIdList(interaction.options.getString('row-ids'),'Inventory row IDs')}), 'Trade-up');
    }
  },
};

// Deployment refresh: keep this service on the latest repository revision.
