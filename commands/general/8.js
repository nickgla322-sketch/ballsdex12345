const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { futbotApi } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8')
    .setDescription('View and manage your eight-player lineup')
    .addSubcommand(s => s.setName('show').setDescription('Show your eight-player lineup')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const response = await futbotApi.request('/api/v1/players/' + interaction.user.id + '/lineup');
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
