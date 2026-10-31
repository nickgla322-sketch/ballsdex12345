const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { futbotApi } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8')
    .setDescription('View and manage your eight-player lineup')
    .addSubcommand(s => s.setName('show').setDescription('Show your eight-player lineup'))
    .addSubcommand(s => s.setName('add').setDescription('Add an owned player to a lineup slot')
      .addStringOption(o => o.setName('player').setDescription('Exact player name').setRequired(true))
      .addIntegerOption(o => o.setName('slot').setDescription('Lineup slot (1-8)').setRequired(true).setMinValue(1).setMaxValue(8)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a player from a lineup slot')
      .addStringOption(o => o.setName('player').setDescription('Exact player name in that slot').setRequired(true))
      .addIntegerOption(o => o.setName('slot').setDescription('Lineup slot (1-8)').setRequired(true).setMinValue(1).setMaxValue(8))),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const subcommand = interaction.options.getSubcommand();
      const basePath = '/api/v1/players/' + interaction.user.id + '/lineup';
      if (subcommand === 'remove') {
        const player = interaction.options.getString('player', true).trim();
        const slot = interaction.options.getInteger('slot', true);
        const removed = await futbotApi.request(basePath + '/remove', {
          method: 'POST',
          body: JSON.stringify({ player, slot }),
        });
        const lineup = removed?.data ?? removed;
        const embed = new EmbedBuilder()
          .setTitle('Player Removed from Lineup')
          .setColor(0xed4245)
          .setDescription('**' + player + '** was removed from slot **' + slot + '**.')
          .addFields({ name: 'Lineup', value: '**' + (lineup.filled ?? '—') + '/8** players · Formation **' + (lineup.formation || '2-2-3') + '**' });
        return interaction.editReply({ embeds: [embed], content: '' });
      }
      if (subcommand === 'add') {
        const player = interaction.options.getString('player', true).trim();
        const slot = interaction.options.getInteger('slot', true);
        const added = await futbotApi.request(basePath + '/add', {
          method: 'POST',
          body: JSON.stringify({ player, slot }),
        });
        const lineup = added?.data ?? added;
        const assigned = Array.isArray(lineup.slots) ? lineup.slots.find(item => Number(item.slot) === slot) : null;
        const card = assigned?.card;
        const penalty = Number(card?.position_penalty || 0);
        const effective = Number(card?.effective_overall ?? card?.overall ?? 0);
        const embed = new EmbedBuilder()
          .setTitle('Player Added to Lineup')
          .setColor(0x57f287)
          .setDescription('**' + (card?.name || player) + '** was added to slot **' + slot + '** (' + (assigned?.position || 'position unavailable') + ').')
          .addFields({ name: 'Lineup', value: '**' + (lineup.filled ?? '—') + '/8** players · Formation **' + (lineup.formation || '2-2-3') + '**' });
        if (card) embed.addFields({ name: 'Rating', value: card.overall + ' OVR' + (penalty ? ' · 🔴 -' + penalty + ' → ' + effective + ' effective OVR' : ''), inline: true });
        return interaction.editReply({ embeds: [embed], content: '' });
      }
      const response = await futbotApi.request(basePath);
      const lineup = response?.data ?? response;
      const slots = Array.isArray(lineup.slots) ? lineup.slots : [];
      const embed = new EmbedBuilder()
        .setTitle('Your FutBot Lineup')
        .setColor(0x5865f2)
        .setDescription('Formation: **' + (lineup.formation || '2-2-3') + '**  ·  **' + (lineup.filled ?? slots.filter(s => s.card).length) + '/8** players')
        .setTimestamp();

      for (const slot of slots) {
        const card = slot.card;
        if (!card) {
          embed.addFields({
            name: 'Slot ' + slot.slot + ' · ' + slot.position,
            value: '*Empty*',
            inline: true,
          });
          continue;
        }
        const penalty = Number(card.position_penalty || 0);
        const effective = Number(card.effective_overall ?? card.overall ?? 0);
        const penaltyText = penalty > 0 ? ' 🔴 **-' + penalty + '**' : '';
        embed.addFields({
          name: 'Slot ' + slot.slot + ' · ' + slot.position + penaltyText,
          value: '**' + card.name + '**\n' +
            (card.position || 'Position unknown') + ' · ' + card.overall + ' OVR' +
            (penalty > 0 ? ' → **' + effective + ' effective OVR**' : ''),
          inline: true,
        });
      }

      if (!slots.length) embed.setDescription('No lineup slots were returned. Try again in a moment.');
      return interaction.editReply({ embeds: [embed], content: '' });
    } catch (error) {
      console.error('[8 show]', error);
      return interaction.editReply({
        content: '**Lineup error**\n' + String(error.message || 'Unknown API error').slice(0, 1800),
        embeds: [],
      });
    }
  },
};
