// Friendly match command — deployment refresh.
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { futbotApi } = require('../../utils/futbotDiscord');
module.exports = {
  data: new SlashCommandBuilder().setName('friendly').setDescription('Challenge another player to a friendly football match').addUserOption(o => o.setName('opponent').setDescription('The player you want to challenge').setRequired(true)),
  async execute(interaction) {
    const opponent = interaction.options.getUser('opponent');
    if (opponent.bot || opponent.id === interaction.user.id) return interaction.reply({ content: 'Choose another human player.', ephemeral: true });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('friendly_accept').setLabel('Accept').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('friendly_decline').setLabel('Decline').setStyle(ButtonStyle.Danger));
    const message = await interaction.reply({ content: opponent.toString() + ', **' + interaction.user.username + '** challenged you to a friendly match!\nDo you accept to friendly **' + interaction.user.username + '**? You have **30 seconds**.', components: [row], fetchReply: true });
    const answer = await message.awaitMessageComponent({ filter: i => i.user.id === opponent.id, time: 30000 }).catch(() => null);
    if (!answer) return interaction.editReply({ content: '⌛ ' + opponent.username + ' did not respond in time. The friendly was cancelled.', components: [] });
    await answer.deferUpdate();
    if (answer.customId === 'friendly_decline') return interaction.editReply({ content: '❌ ' + opponent.username + ' declined the friendly match.', components: [] });
    await interaction.editReply({ content: '✅ ' + opponent.username + ' accepted! Preparing both teams...', components: [] });
    try {
      await Promise.all([
        futbotApi.request('/api/v1/players/' + interaction.user.id, { method: 'POST', body: JSON.stringify({ name: interaction.user.username }) }),
        futbotApi.request('/api/v1/players/' + opponent.id, { method: 'POST', body: JSON.stringify({ name: opponent.username }) }),
      ]);
      const responses = await Promise.all([futbotApi.request('/api/v1/players/' + interaction.user.id + '/lineup'), futbotApi.request('/api/v1/players/' + opponent.id + '/lineup')]);
      const home = makeTeam(responses[0]?.data ?? responses[0], interaction.user);
      const away = makeTeam(responses[1]?.data ?? responses[1], opponent);
      validate(home); validate(away);
      const intro = new EmbedBuilder().setColor(0x3498db).setTitle('⚽ FRIENDLY MATCH').setDescription('**' + home.name + '** vs **' + away.name + '**').addFields({ name: home.name + ' · ' + home.formation, value: lineupText(home), inline: true }, { name: away.name + ' · ' + away.formation, value: lineupText(away), inline: true }, { name: 'Team Overalls', value: '**' + home.name + ':** ' + home.overall + ' OVR\n**' + away.name + ':** ' + away.overall + ' OVR' }).setFooter({ text: '8 players per side • Position penalties included' });
      await interaction.followUp({ embeds: [intro] });
      await sleep(7000);
      const result = await runLiveMatch(interaction, home, away);
      const winner = result.winner === null ? 'The friendly ends in a draw.' : '🏆 **' + (result.winner === 0 ? home.name : away.name) + '** win the friendly!';
      const summary = new EmbedBuilder().setColor(result.winner === null ? 0x95a5a6 : 0xf1c40f).setTitle('🏁 FINAL RESULT').setDescription('**' + home.name + ' ' + result.score[0] + '–' + result.score[1] + ' ' + away.name + '**' + (result.pens ? '\nPenalty shootout: **' + result.pens[0] + '–' + result.pens[1] + '**' : '') + '\n\n' + winner).addFields(
        { name: home.name + ' · Statistics', value: '**Goals:** ' + result.stats[0].goals + '\n**Shots:** ' + result.stats[0].shots + '\n**Shots on target:** ' + result.stats[0].sot + '\n**Possession:** ' + result.stats[0].possession + '%', inline: true },
        { name: away.name + ' · Statistics', value: '**Goals:** ' + result.stats[1].goals + '\n**Shots:** ' + result.stats[1].shots + '\n**Shots on target:** ' + result.stats[1].sot + '\n**Possession:** ' + result.stats[1].possession + '%', inline: true }
      ).addFields(
        { name: home.name, value: home.overall + ' OVR · ' + active(home).length + '/8 players remaining', inline: true },
        { name: away.name, value: away.overall + ' OVR · ' + active(away).length + '/8 players remaining', inline: true }
      );
      await interaction.followUp({ embeds: [summary] });
    } catch (error) { console.error('[friendly]', error); await interaction.followUp({ content: '**Friendly error:** ' + String(error.message || 'Could not start the match.').slice(0, 1500), ephemeral: true }); }
  },
};

function makeTeam(data, user) {
  const players = (Array.isArray(data?.slots) ? data.slots : []).map((slot, i) => {
    const c = slot.card || slot; const ovr = Number(c.overall) || 0;
    return { id: String(c.card_id || i), name: String(c.name || 'Unknown'), position: String(slot.position || c.slot_position || c.position || 'CM').toUpperCase(), overall: ovr, effective: Number(c.effective_overall ?? ovr), shooting: Number(c.shooting ?? c.attack ?? 50), dribbling: Number(c.dribbling ?? 50), defense: Number(c.defense ?? 50), goalkeeping: Number(c.goalkeeping ?? 25), yellow: 0, sentOff: false };
  });
  return { id: user.id, name: user.username, formation: String(data?.formation || 'Unknown'), players, overall: players.length ? Math.round(players.reduce((s,p) => s + p.effective, 0) / players.length) : 0 };
}
function validate(t) { if (t.players.length !== 8) throw new Error(t.name + ' needs all 8 slots filled. Use /8 show to check.'); if (!t.players.some(p => p.position === 'GK')) throw new Error(t.name + ' needs a goalkeeper.'); }
function lineupText(t) { return t.players.map((p,i) => '**' + (i+1) + '. ' + p.name + '** · ' + p.position + ' · ' + p.effective + ' OVR').join('\n'); }
function active(t) { return t.players.filter(p => !p.sentOff); }
function avg(t, key) { const a=active(t); return a.length ? a.reduce((s,p)=>s+p[key],0)/a.length : 0; }
function choose(list, score) { if (!list.length) return null; const weights=list.map(p=>Math.max(1,score(p))); let n=Math.random()*weights.reduce((a,b)=>a+b,0); for(let i=0;i<list.length;i++){ n-=weights[i]; if(n<=0)return list[i]; } return list[list.length-1]; }
function keeper(t) { return t.players.find(p=>p.position==='GK'&&!p.sentOff) || { name:'Emergency goalkeeper', goalkeeping:18 }; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function playerLabel(player, team) { return '**' + player.name + '** (<@' + team.id + '>)'; }
async function runLiveMatch(interaction, home, away) {
  const teams = [home, away], score = [0, 0], pending = [];
  const stats = teams.map(() => ({ shots: 0, sot: 0, saves: 0, corners: 0, fouls: 0, possession: 0 }));
  const EMOJI = {
    red: '<:redcard:1361074355538497556>',
    yellow: '<:yellowcard:1361074497007915018>',
    goal: '<:goal:1362833393183756388>',
    assist: '<:assist:1362834880291016775>',
    save: '<:save:1455318354926633125>',
    penaltyGoal: '<:penaltygoal:1362833489824714833>',
    missedPenalty: '<:missedpenalty:1362833748126728402>',
    ownGoal: '<:owngoal:1362833434082283811>',
  };
  let pens = null, minute = 0, currentMessage = null;
  const teamHistory = [[], []];
  let systemHistory = [];
  let minuteEventsLog = [];
  const formatMinute = m => m > 90 && m <= 99 ? '90+' + (m - 90) : String(m);
  const log = (i, player, emoji, m = minute, extra = '') => {
    const name = player ? player.name : teams[i].name;
    minuteEventsLog.push({ team: i, text: name + ' ' + emoji + (extra ? ' ' + extra : '') + ' ' + formatMinute(m) + "'" });
  };
  const giveYellow = (teamIndex, player) => {
    player.yellow++;
    log(teamIndex, player, EMOJI.yellow);
    if (player.yellow >= 2) {
      player.sentOff = true;
      log(teamIndex, player, EMOJI.red);
    }
  };
  const activePlayers = t => t.players.filter(p => !p.sentOff);
  const field = t => activePlayers(t).filter(p => p.position !== 'GK');
  const attackers = t => activePlayers(t).filter(p => ['ST', 'CF', 'LW', 'RW', 'CAM'].includes(p.position));
  const choosePlayer = (list, fn) => {
    if (!list.length) return null;
    const weights = list.map(p => Math.max(1, fn(p)));
    let n = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { n -= weights[i]; if (n <= 0) return list[i]; }
    return list[list.length - 1];
  };
  const getKeeper = t => t.players.find(p => p.position === 'GK' && !p.sentOff) || { name: 'Emergency GK', goalkeeping: 18 };
  // Overall gives an advantage, but it should not decide possession too heavily.
  const pickAttack = () => Math.random() < Math.max(.38, Math.min(.62, .5 + (home.overall - away.overall) * .006)) ? 0 : 1;
  const addPossession = i => { stats[i].possession++; };
  const scoreGoal = (i, scorer, kind = 'normal') => {
    score[i]++;
    if (kind === 'penalty') {
      log(i, scorer, EMOJI.penaltyGoal);
      return;
    }
    log(i, scorer, EMOJI.goal);
    const teammates = field(teams[i]).filter(p => p.id !== scorer.id);
    if (teammates.length && Math.random() < .70) {
      const assister = choosePlayer(teammates, p => p.dribbling + p.effective * .25);
      if (assister) {
        minuteEventsLog.push({ team: i, text: '　• ' + assister.name + ' ' + EMOJI.assist });
      }
    }
  };
  const makeEmbed = () => new EmbedBuilder().setColor(0x3498db)
    .setTitle('⚽ FRIENDLY MATCH · ' + formatMinute(minute) + "'")
    .setDescription('**⏱️ ' + formatMinute(minute) + "'**\n**" + home.name + '** ' + score[0] + '–' + score[1] + ' **' + away.name + '**' + (systemHistory.length ? '\n\n' + systemHistory.join('\n') : ''))
    .addFields(
      { name: home.name, value: teamHistory[0].join('\n\n').slice(-1024) || 'No events yet.', inline: true },
      { name: away.name, value: teamHistory[1].join('\n\n').slice(-1024) || 'No events yet.', inline: true }
    )
    .setFooter({ text: 'Match events' });
  const publish = async () => {
    for (const event of minuteEventsLog) {
      if (event.team === null) systemHistory.push(event.text);
      else if (event.text.startsWith('　• ') && teamHistory[event.team].length) teamHistory[event.team][teamHistory[event.team].length - 1] += '\n' + event.text;
      else teamHistory[event.team].push(event.text);
    }
    const totalLength = teamHistory[0].join('\n').length + teamHistory[1].join('\n').length + systemHistory.join('\n').length;
    if (!currentMessage || totalLength > 6500) {
      teamHistory[0] = teamHistory[0].slice(-18);
      teamHistory[1] = teamHistory[1].slice(-18);
      systemHistory = systemHistory.slice(-4);
      currentMessage = await interaction.followUp({ embeds: [makeEmbed()], fetchReply: true });
    } else {
      await currentMessage.edit({ embeds: [makeEmbed()] });
    }
    await sleep(1100);
  };

  function shot(ai) {
    const at = teams[ai], defending = teams[1 - ai];
    // Any outfield player can score; attackers are favored, but midfielders and defenders remain eligible.
    const p = choosePlayer(field(at), x => {
      const positionBoost = ['ST', 'CF', 'LW', 'RW'].includes(x.position) ? 1.55
        : ['CAM', 'CM', 'CDM', 'LM', 'RM'].includes(x.position) ? 1.2 : 0.8;
      return (x.shooting + x.dribbling * .3 + x.effective * .2) * positionBoost;
    });
    if (!p) return;
    stats[ai].shots++;
    const g = getKeeper(defending);
    const edge = at.overall - defending.overall;
    // Rare own goals can happen when a defender gets involved in a dangerous attack.
    if (Math.random() < .006) {
      const defender = choosePlayer(field(defending), x => x.defense + x.effective * .2);
      if (defender) {
        stats[ai].sot++;
        score[ai]++;
        minuteEventsLog.push({ team: 1 - ai, text: defender.name + ' ' + EMOJI.ownGoal + ' ' + formatMinute(minute) + "'" });
        return;
      }
    }
    // Keep scoring chances modest; overall and player stats matter, but variance stays high enough for upsets.
    const chance = Math.max(.08, Math.min(.32, .14 + edge * .005 + (p.shooting - g.goalkeeping) * .001));
    if (Math.random() < chance) {
      stats[ai].sot++;
      scoreGoal(ai, p);
    } else if (Math.random() < .45) {
      stats[ai].sot++;
      stats[1 - ai].saves++;
      log(1 - ai, g, EMOJI.save, minute, '(' + p.name + ')');
      if (Math.random() < .16) pending.push(() => corner(ai));
    }
  }
  function corner(ai) {
    const t = teams[ai], taker = choosePlayer(field(t), p => p.effective + p.overall * .1);
    if (!taker) return;
    stats[ai].corners++;
    const target = choosePlayer(attackers(t).filter(p => p.id !== taker.id), p => p.effective + p.shooting * .3);
    if (target) pending.push(() => {
      if (Math.random() < .10) { stats[ai].shots++; stats[ai].sot++; scoreGoal(ai, target); }
      else if (Math.random() < .35) { stats[ai].shots++; }
    });
  }
  function freeKick(ai, victim) {
    const t = teams[ai], taker = choosePlayer(field(t), p => p.shooting * .6 + p.effective * .4);
    if (!taker) return;
    pending.push(() => { if (Math.random() < .20) shot(ai); });
  }
  function penalty(ai) {
    const t = teams[ai], g = getKeeper(teams[1 - ai]);
    const kicker = choosePlayer(field(t), p => p.shooting + p.effective * .2);
    if (!kicker) return;
    pending.push(() => {
      if (Math.random() < Math.max(.66, Math.min(.88, .77 + (kicker.shooting - g.goalkeeping) / 500))) {
        stats[ai].shots++; stats[ai].sot++; scoreGoal(ai, kicker, 'penalty');
      } else {
        stats[ai].shots++; stats[1 - ai].saves++;
        log(ai, kicker, EMOJI.missedPenalty);
      }
    });
  }
  function foul() {
    const oi = Math.random() < .5 ? 0 : 1, ai = 1 - oi;
    const offender = choosePlayer(field(teams[oi]), p => p.defense + p.effective * .2);
    const victim = choosePlayer(field(teams[ai]), p => p.effective);
    if (!offender || !victim) return;
    stats[oi].fouls++;
    if (Math.random() < .025) {
      offender.sentOff = true;
      log(oi, offender, EMOJI.red);
    } else if (Math.random() < .20) {
      giveYellow(oi, offender);
    }
    pending.push(() => {
      if (Math.random() < .045) {
        // A penalty is accompanied by a yellow card for the player who committed the foul.
        giveYellow(oi, offender);
        minuteEventsLog.push({ team: ai, text: '**⚠️ PENALTY TO ' + victim.name.toUpperCase() + '!**' });
        penalty(ai);
      } else {
        freeKick(ai, victim);
      }
    });
  }
  function playMinute() {
    const possessionTeam = pickAttack();
    addPossession(possessionTeam);
    if (pending.length) { pending.shift()(); return; }
    const r = Math.random();
    if (r < .07) foul();
    else if (r < .12) corner(possessionTeam);
    else if (r < .32) shot(possessionTeam);
  }
  const playPeriod = async end => {
    for (let m = minute + 1; m <= end; m++) {
      minute = m; minuteEventsLog = []; playMinute(); await publish();
    }
  };

  minute = 0;
  minuteEventsLog = [{ team: null, text: '**KICK-OFF**' }];
  await publish();
  await playPeriod(45);
  minuteEventsLog = [{ team: null, text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n**HALF-TIME**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' }];
  await publish();
  await playPeriod(90);
  const stoppage = 2 + Math.floor(Math.random() * 3);
  for (let extra = 1; extra <= stoppage || pending.length; extra++) {
    if (extra > 8) break;
    minute = 90 + extra; minuteEventsLog = [];
    if (extra > 1 || pending.length) playMinute();
    await publish();
  }
  minuteEventsLog = [{ team: null, text: '**FULL-TIME**' }];
  await publish();

  if (score[0] === score[1]) {
    await interaction.followUp({ content: '**Extra time**' });
    await playPeriod(minute + 15);
    await playPeriod(minute + 15);
  }
  if (score[0] === score[1]) {
    pens = [0, 0];
    const kick = async i => {
      const t = teams[i], g = getKeeper(teams[1 - i]);
      const p = choosePlayer(field(t), x => x.shooting + x.effective * .2);
      if (!p) return;
      const goal = Math.random() < Math.max(.66, Math.min(.86, .76 + (p.shooting - g.goalkeeping) / 500));
      if (goal) pens[i]++;
      minuteEventsLog = [];
      log(i, p, goal ? EMOJI.penaltyGoal : EMOJI.missedPenalty, minute, '(Shootout)');
      await publish();
    };
    for (let r = 0; r < 5; r++) {
      for (let i = 0; i < 2; i++) await kick(i);
      const left = 4 - r;
      if (pens[0] > pens[1] + left || pens[1] > pens[0] + left) break;
    }
    while (pens[0] === pens[1]) { await kick(0); await kick(1); }
  }
  const winner = pens ? (pens[0] > pens[1] ? 0 : 1) : (score[0] === score[1] ? null : (score[0] > score[1] ? 0 : 1));
  const totalPossession = stats[0].possession + stats[1].possession;
  const percentages = stats.map(s => totalPossession ? Math.round(s.possession / totalPossession * 100) : 50);
  const resultStats = stats.map((s, i) => ({
    ...s,
    goals: score[i],
    possession: percentages[i],
  }));
  return { score, pens, winner, stats: resultStats };
}
