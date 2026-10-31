const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    .addSubcommand(s => s.setName('formation').setDescription('Choose a formation for your eight-player lineup')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const subcommand = interaction.options.getSubcommand();
      const basePath = '/api/v1/players/' + interaction.user.id + '/lineup';
      if (subcommand === 'formation') {
        const formations = {
          2: ['2-2-3', '2-3-2 (CDM)', '2-3-2 (CAM)', '2-3-2 (3 CM)', '2-4-1'],
          3: ['3-2-2', '3-3-1 (CDM)', '3-3-1 (CAM)', '3-3-1 (3 CM)'],
          4: ['4-2-1', '4-1-2'],
        };
        const makeDefenderButtons = () => new ActionRowBuilder().addComponents(
          ...[2, 3, 4].map(count => new ButtonBuilder()
            .setCustomId('lineup-defenders-' + count)
            .setLabel(count + ' Defenders')
            .setStyle(ButtonStyle.Primary))
        );
        const makeFormationButtons = count => new ActionRowBuilder().addComponents(
          ...formations[count].map(name => new ButtonBuilder()
            .setCustomId('lineup-formation-' + name)
            .setLabel(name)
            .setStyle(ButtonStyle.Success))
            .concat(new ButtonBuilder()
              .setCustomId('lineup-formation-back')
              .setLabel('Back')
              .setStyle(ButtonStyle.Secondary))
        );
        const menuEmbed = new EmbedBuilder()
          .setTitle('Choose Your Defensive Setup')
          .setColor(0x5865f2)
          .setDescription(
            'Choose how many defenders you want in your formation. Every option has exactly **8 players**: 1 goalkeeper, the selected number of defenders, and enough midfielders to have at least half as many midfielders as attackers.'
          );
        const message = await interaction.editReply({
          content: '',
          embeds: [menuEmbed],
          components: [makeDefenderButtons()],
        });
        const collector = message.createMessageComponentCollector({
          filter: component => component.user.id === interaction.user.id,
          time: 120000,
        });
        collector.on('collect', async component => {
          await component.deferUpdate();
          const id = component.customId;
          if (id.startsWith('lineup-defenders-')) {
            const count = Number(id.split('-').pop());
            const choiceEmbed = new EmbedBuilder()
              .setTitle(count + ' Defender Formations')
              .setColor(0x5865f2)
              .setDescription(
                'Choose a formation below. Each setup has 1 GK, ' + count +
                ' defenders, with at least half as many midfielders as attackers.'
              );
            return interaction.editReply({
              embeds: [choiceEmbed],
              components: [makeFormationButtons(count)],
            });
          }
          if (id === 'lineup-formation-back') {
            return interaction.editReply({
              embeds: [menuEmbed],
              components: [makeDefenderButtons()],
            });
          }
          if (id.startsWith('lineup-formation-')) {
            const formation = id.replace('lineup-formation-', '');
            if (!Object.values(formations).flat().includes(formation)) return;
            try {
              const changed = await futbotApi.request(basePath + '/formation', {
                method: 'PUT',
                body: JSON.stringify({ formation }),
              });
              const lineup = changed?.data ?? changed;
              const successEmbed = new EmbedBuilder()
                .setTitle('Formation Updated')
                .setColor(0x57f287)
                .setDescription('Your lineup formation is now **' + (lineup.formation || formation) + '**.')
                .addFields({
                  name: 'Lineup',
                  value: '**' + (lineup.filled ?? '-') +
                    '/8** players assigned. Your players remain in their numbered slots; their position penalties are recalculated.',
                });
              await interaction.editReply({ embeds: [successEmbed], components: [], content: '' });
              collector.stop('selected');
            } catch (error) {
              const errorEmbed = new EmbedBuilder()
                .setTitle('Formation Error')
                .setColor(0xed4245)
                .setDescription(String(error.message || 'Could not update your formation.').slice(0, 1800));
              await interaction.editReply({ embeds: [errorEmbed], components: [], content: '' });
              collector.stop('error');
            }
          }
        });
        collector.on('end', (_, reason) => {
          if (reason === 'time') {
            interaction.editReply({ components: [] }).catch(() => {});
          }
        });
        return;
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
          .addFields({ name: 'Lineup', value: '**' + (lineup.filled ?? '-') + '/8** players · Formation **' + (lineup.formation || '2-2-3') + '**' });
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
          .addFields({ name: 'Lineup', value: '**' + (lineup.filled ?? '-') + '/8** players · Formation **' + (lineup.formation || '2-2-3') + '**' });
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
          .addFields({ name: 'Lineup', value: '**' + (lineup.filled ?? '-') + '/8** players · Formation **' + (lineup.formation || '2-2-3') + '**' });
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
