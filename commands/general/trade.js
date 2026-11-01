const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { futbotApi, cardFile, post, put } = require('../../utils/futbotDiscord');

const data = r => r?.data ?? r;
const get = path => futbotApi.request(path).then(data);
const inventory = async id => (await get('/api/v1/players/' + id + '/inventory')).cards || [];
const MAX = 5;

module.exports = {
  data: new SlashCommandBuilder().setName('trade').setDescription('Trade player cards and coins')
    .addUserOption(o => o.setName('user').setDescription('Player to trade with').setRequired(true)),
  async execute(interaction) {
    const target = interaction.options.getUser('user');
    if (target.bot || target.id === interaction.user.id) return interaction.reply({ content: 'Choose another player, not yourself or a bot.', ephemeral: true });
    await interaction.deferReply();
    let session;
    try {
      // Inventory rows and player accounts are separate records in the API.
      // Register both Discord users before creating the exchange so players
      // with existing cards are not rejected as missing player accounts.
      await post('/api/v1/players/' + interaction.user.id, {
        name: interaction.member?.displayName || interaction.user.username,
      });
      await post('/api/v1/players/' + target.id, {
        name: target.globalName || target.username,
      });
      await inventory(interaction.user.id);
      await inventory(target.id);
      session = data(await post('/api/v1/exchanges', {
        player1_id: interaction.user.id,
        player2_id: target.id,
        player1_name: interaction.member?.displayName || interaction.user.username,
        player2_name: target.globalName || target.username,
      }));
      const invite = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('trade_invite_yes').setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('trade_invite_no').setLabel('Decline').setStyle(ButtonStyle.Danger)
      );
      const msg = await interaction.editReply({ content: target.toString() + ', **' + interaction.user.username + '** invited you to trade. You have 30 seconds.', components: [invite] });
      const invitation = await msg.awaitMessageComponent({ time: 30000, filter: i => i.user.id === target.id });
      await invitation.deferUpdate();
      if (invitation.customId === 'trade_invite_no') {
        await post('/api/v1/exchanges/' + session.session_id + '/cancel', { user_id: interaction.user.id });
        return interaction.editReply({ content: 'Trade invitation declined.', components: [] });
      }
      const names = { p1: interaction.user.username, p2: target.username };
      let state = await get('/api/v1/exchanges/' + session.session_id);
      const sideFor = id => String(id) === interaction.user.id ? 'p1' : 'p2';
      const build = async note => {
        state = await get('/api/v1/exchanges/' + session.session_id);
        const cardInventories = (await Promise.all([inventory(interaction.user.id), inventory(target.id)])).flat();
        state.cardNames = {};
        for (const card of cardInventories) state.cardNames[card.card_id] = card.name + ' · ' + card.overall + ' OVR';
        const desc = side => {
          const cards = state[side + '_cards'] || [];
          return (cards.length ? cards.map(id => '• ' + (state.cardNames?.[id] || ('Card #' + id))).join('\n') : '• No players offered') + '\n**Coins:** ' + Number(state[side + '_coins'] || 0).toLocaleString();
        };
        const acceptedName = (name, accepted) => (accepted ? '✓ ' : '◷ ') + name;
        const embed = new EmbedBuilder()
          .setTitle('⚽ Player Trade')
          .setColor(state.p1_confirmed && state.p2_confirmed ? 0x57f287 : 0x5865f2)
          .setDescription('Review both offers below. Any offer change resets both acceptances.')
          .addFields(
            { name: acceptedName(names.p1, state.p1_confirmed), value: desc('p1'), inline: true },
            { name: acceptedName(names.p2, state.p2_confirmed), value: desc('p2'), inline: true },
            {
              name: 'Trade status',
              value: [
                (state.p1_confirmed ? '✓' : '◷') + ' **' + names.p1 + '** ' + (state.p1_confirmed ? 'accepted' : 'waiting'),
                (state.p2_confirmed ? '✓' : '◷') + ' **' + names.p2 + '** ' + (state.p2_confirmed ? 'accepted' : 'waiting'),
              ].join('\\n'),
              inline: false,
            },
          );
        if (note) embed.setFooter({ text: note });
        const side = sideFor(interaction.user.id);
        const rows = state.status === 'open' ? [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('tr_add').setLabel('Add Player').setStyle(ButtonStyle.Primary).setDisabled((state[side + '_cards'] || []).length >= MAX),
          new ButtonBuilder().setCustomId('tr_remove').setLabel('Remove Player').setStyle(ButtonStyle.Secondary).setDisabled(!(state[side + '_cards'] || []).length),
          new ButtonBuilder().setCustomId('tr_coins').setLabel('Set Coins').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('tr_accept').setLabel(state[side + '_confirmed'] ? 'Accepted' : 'Accept Trade').setStyle(ButtonStyle.Success).setDisabled(false),
          new ButtonBuilder().setCustomId('tr_end').setLabel('End Trade').setStyle(ButtonStyle.Danger)
        )] : [];
        await interaction.editReply({ content: state.status === 'completed' ? 'Trade completed! Cards and coins have been transferred.' : state.status === 'cancelled' ? 'Trade ended. Nothing was transferred.' : '', embeds: [embed], components: rows });
      };
      const showCardImages = async () => {
        state = await get('/api/v1/exchanges/' + session.session_id);
        const ids = [...new Set([...(state.p1_cards || []), ...(state.p2_cards || [])])];
        const inventories = (await Promise.all([inventory(state.player1_id), inventory(state.player2_id)])).flat();
        state.cardNames = {};
        for (const id of ids) {
          const card = inventories.find(x => Number(x.card_id) === Number(id));
          if (!card) continue;
          state.cardNames[id] = card.name + ' · ' + card.overall + ' OVR';
          const file = await cardFile(card).catch(() => null);
          const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(state.cardNames[id]);
          if (file) embed.setThumbnail('attachment://' + file.name);
          await interaction.followUp({ embeds: [embed], files: file ? [file] : [], ephemeral: false });
        }
      };
      await build();
      const collector = msg.createMessageComponentCollector({ time: 900000 });
      collector.on('collect', async c => {
        if (![interaction.user.id, target.id].includes(c.user.id)) return c.reply({ content: 'This is not your trade.', ephemeral: true });
        const side = c.user.id === interaction.user.id ? 'p1' : 'p2';
        try {
          if (c.customId === 'tr_add' || c.customId === 'tr_remove') {
            const latest = await get('/api/v1/exchanges/' + session.session_id);
            const offered = latest[side + '_cards'] || [];
            const owned = await inventory(c.user.id);
            const uniqueOwned = [...new Map(owned.map(card => [String(card.card_id), card])).values()];
            const choices = (c.customId === 'tr_add' ? uniqueOwned.filter(x => !offered.some(id => String(id) === String(x.card_id))) : uniqueOwned.filter(x => offered.some(id => String(id) === String(x.card_id)))).slice(0, 25);
            if (!choices.length) return c.reply({ content: 'No players available for that action.', ephemeral: true });
            const menu = new StringSelectMenuBuilder().setCustomId('tr_select_' + c.customId.slice(3)).setPlaceholder('Choose player card(s)').setMinValues(1).setMaxValues(c.customId === 'tr_add' ? Math.min(MAX - offered.length, choices.length) : choices.length)
              .addOptions(choices.map(x => ({ label: (x.name + ' · ' + x.overall + ' OVR').slice(0, 100), value: String(x.card_id) })));
            await c.reply({ content: 'Select player card(s):', components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
            const reply = await c.fetchReply();
            const selected = await reply.awaitMessageComponent({ time: 60000, filter: x => x.user.id === c.user.id });
            const chosen = selected.values.map(Number);
            const updated = c.customId === 'tr_add' ? [...new Set([...offered, ...chosen])] : offered.filter(id => !chosen.includes(Number(id)));
            await put('/api/v1/exchanges/' + session.session_id + '/offer', { user_id: c.user.id, card_ids: updated, coins: latest[side + '_coins'] || 0 });
            await selected.update({ content: 'Offer updated. Both acceptances were reset.', components: [] });
            await build('Offer changed; both players must accept again.');
            await showCardImages();
          } else if (c.customId === 'tr_coins') {
            const modal = new ModalBuilder().setCustomId('tr_coins_modal').setTitle('Set coin offer');
            modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Coins to offer').setStyle(TextInputStyle.Short).setRequired(true).setValue('0')));
            await c.showModal(modal);
            const submitted = await c.awaitModalSubmit({ time: 60000, filter: x => x.user.id === c.user.id });
            const amount = Number(submitted.fields.getTextInputValue('amount'));
            if (!Number.isSafeInteger(amount) || amount < 0) return submitted.reply({ content: 'Enter a whole number of 0 or more.', ephemeral: true });
            const latest = await get('/api/v1/exchanges/' + session.session_id);
            await put('/api/v1/exchanges/' + session.session_id + '/offer', { user_id: c.user.id, card_ids: latest[side + '_cards'], coins: amount });
            await submitted.reply({ content: 'Coin offer updated. Both acceptances were reset.', ephemeral: true });
            await build('Offer changed; both players must accept again.');
          } else if (c.customId === 'tr_accept') {
            await c.deferUpdate();
            await post('/api/v1/exchanges/' + session.session_id + '/confirm', { user_id: c.user.id });
            await build('Acceptance recorded.');
            if (state.status === 'completed') collector.stop('completed');
          } else if (c.customId === 'tr_end') {
            await c.deferUpdate();
            await post('/api/v1/exchanges/' + session.session_id + '/cancel', { user_id: c.user.id });
            await build('Trade ended.');
            collector.stop('cancelled');
          }
        } catch (error) {
          if (!c.replied && !c.deferred) await c.reply({ content: String(error.message || 'Trade action failed.').slice(0, 1500), ephemeral: true }).catch(() => {});
          else await c.followUp({ content: String(error.message || 'Trade action failed.').slice(0, 1500), ephemeral: true }).catch(() => {});
        }
      });
      collector.on('end', async (_, reason) => {
        if (reason === 'time') await post('/api/v1/exchanges/' + session.session_id + '/cancel', { user_id: interaction.user.id }).catch(() => {});
        await interaction.editReply({ components: [] }).catch(() => {});
      });
    } catch (error) {
      if (session?.session_id) await post('/api/v1/exchanges/' + session.session_id + '/cancel', { user_id: interaction.user.id }).catch(() => {});
      await interaction.editReply({ content: '**Trade error**\n' + String(error.message || 'Could not start the trade.').slice(0, 1600), components: [] });
    }
  },
};