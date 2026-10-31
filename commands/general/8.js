const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { futbotApi } = require('../../utils/futbotDiscord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('8')
    .setDescription('View and manage your eight-player lineup')
    .addSubcommand(s => s.setName('show').setDescription('Show your eight-player lineup'))
    .addSubcommand(s => s.setName('add').setDescription('Add an owned player to a lineup slot')
      .addStringOption(o => o.setName('player').setDescription('Player name or part of their name').setRequired(true))
      .addIntegerOption(o => o.setName('slot').setDescription('Lineup slot (1-8)').setRequired(true).setMinValue(1).setMaxValue(8)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a player from a lineup slot')
      .addIntegerOption(o => o.setName('slot').setDescription('Lineup slot (1-8)').setRequired(true).setMinValue(1).setMaxValue(8)))
    .addSubcommand(s => s.setName('swap').setDescription('Swap two players between lineup slots')
      .addIntegerOption(o => o.setName('slot1').setDescription('First slot (1-8)').setRequired(true).setMinValue(1).setMaxValue(8))
      .addIntegerOption(o => o.setName('slot2').setDescription('Second slot (1-8)').setRequired(true).setMinValue(1).setMaxValue(8)))
    .addSubcommand(s => s.setName('formation').setDescription('Change your lineup formation')
      .addStringOption(o => o.setName('name').setDescription('Choose a formation').setRequired(true).addChoices(
        { name: '2-2-3', value: '2-2-3' },
        { name: '3-2-2', value: '3-2-2' },
        { name: '2-3-2', value: '2-3-2' },
        { name: '4-2-1', value: '4-2-1' },
        { name: '3-3-1', value: '3-3-1' },
      ))),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const subcommand = interaction.options.getSubcommand();
      const basePath = '/api/v1/players/' + interaction.user.id + '/lineup';
      if (subcommand === 'formation') {
        const formation = interaction.options.getString('name', true);
        const changed = await futbotApi.request(basePath + '/formation', {
          method: 'PUT',
          body: JSON.stringify({ formation }),
        });
        const lineup = changed?.data ?? changed;
        const embed = new EmbedBuilder()
          .setTitle('Formation Updated')
          .setColor(0x57f287)
          .setDescription('Your lineup formation is now **' + (lineup.formation || formation) + '**.')
          .addFields({ name: 'Lineup', value: '**' + (lineup.filled ?? '—') + '/8** players assigned. Your players remain in their numbered slots; their position penalties are recalculated for the new formation.' });
        return interaction.editReply({ embeds: [embed], content: '' });
      }
      if (subcommand === 'remove') {
        const slot = interaction.options.getInteger('slot', true);
        const removed = await futbotApi.request(basePath + '/remove', {
          method: 'POST',
          body: JSON.stringify({ slot }),
        });
        const lineup = removed?.data ?? removed;
        const embed = new EmbedBuilder()
          .setTitle('Player Removed from Lineup')
          .setColor(0xed4245)
          .setDescription('The player in slot **' + slot + '** was removed.')
          .addFields({ name: 'Lineup', value: '**' + (lineup.filled ?? '—') + '/8** players · Formation **' + (lineup.formation || '2-2-3') + '**' });
        return interaction.editReply({ embeds: [embed], content: '' });
      }
      if (subcommand === 'swap') {
        const slot1 = interaction.options.getInteger('slot1', true);
        const slot2 = interaction.options.getInteger('slot2', true);
        const swapped = await futbotApi.request(basePath + '/swap', {
          method: 'POST',
          body: JSON.stringify({ slot1, slot2 }),
        });
        const lineup = swapped?.data ?? swapped;
        const embed = new EmbedBuilder()
          .setTitle('Lineup Players Swapped')
          .setColor(0x57f287)
          .setDescription('Updated slots **' + slot1 + '** and **' + slot2 + '**. Players are moved into empty slots or swapped when both slots are occupied. Position penalties have been recalculated.')
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
      const baseUrl = (process.env.FUTBOT_API_URL || '').replace(/\/+$/, '');
      const apiKey = process.env.FUTBOT_API_KEY || '';
      if (!baseUrl || !apiKey) throw new Error('FUTBOT_API_URL or FUTBOT_API_KEY is not configured.');
      const imageResponse = await fetch(baseUrl + basePath + '/image', {
        headers: { 'X-API-Key': apiKey },
      });
      if (!imageResponse.ok) {
        const message = await imageResponse.text();
        throw new Error(message || 'Could not generate the lineup image.');
      }
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const imageName = 'futbot-lineup-' + interaction.user.id + '.png';
      const embed = new EmbedBuilder()
        .setTitle('Your FutBot Lineup')
        .setColor(0x5865f2)
        .setDescription('Formation: **' + (lineup.formation || '2-2-3') + '**  ·  **' + (lineup.filled ?? slots.filter(s => s.card).length) + '/8** players\\nRed badges show the overall penalty for playing out of position.')
        .setImage('attachment://' + imageName)
        .setTimestamp();

      return interaction.editReply({
        content: '',
        embeds: [embed],
        files: [{ attachment: imageBuffer, name: imageName }],
      });
    } catch (error) {
      console.error('[8 show]', error);
      return interaction.editReply({
        content: '**Lineup error**\n' + String(error.message || 'Unknown API error').slice(0, 1800),
        embeds: [],
      });
    }
  },
};
