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
      const motm = result.motm;
      const summary = new EmbedBuilder().setColor(result.winner === null ? 0x95a5a6 : 0xf1c40f).setTitle('🏁 FINAL RESULT').setDescription('**' + home.name + ' ' + result.score[0] + '–' + result.score[1] + ' ' + away.name + '**' + (result.pens ? '\nPenalty shootout: **' + result.pens[0] + '–' + result.pens[1] + '**' : '') + '\n\n' + winner + '\n\n⭐ **MAN OF THE MATCH: ' + motm.player.name + '** (' + teamsafeName(motm.team) + ')\n' + motm.reason).addFields(
        { name: home.name + ' · Statistics', value: '**Goals:** ' + result.stats[0].goals + '\n**Shots:** ' + result.stats[0].shots + '\n**Shots on target:** ' + result.stats[0].sot + '\n**Possession:** ' + result.stats[0].possession + '%\n\n**' + home.overall + ' OVR** · ' + active(home).length + '/8 players remaining', inline: true },
        { name: away.name + ' · Statistics', value: '**Goals:** ' + result.stats[1].goals + '\n**Shots:** ' + result.stats[1].shots + '\n**Shots on target:** ' + result.stats[1].sot + '\n**Possession:** ' + result.stats[1].possession + '%\n\n**' + away.overall + ' OVR** · ' + active(away).length + '/8 players remaining', inline: true }
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
function teamsafeName(team) { return team.name; }
async function runLiveMatch(interaction, home, away) {
  // TEMP TESTING SWITCH: set to false to restore normal extra-time and shootout rules.
  const FORCE_PENALTY_SHOOTOUT_FOR_TESTING = true;
  const teams = [home, away], score = [0, 0], pending = [];
  const scorerGoals = new Map();
  const playerPerformance = new Map();
  const performanceFor = (teamIndex, player) => {
    const key = teamIndex + ':' + player.id;
    if (!playerPerformance.has(key)) playerPerformance.set(key, { player, teamIndex, goals: 0, assists: 0, saves: 0 });
    return playerPerformance.get(key);
  };
  teams.forEach((team, teamIndex) => team.players.forEach(player => performanceFor(teamIndex, player)));
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
  let inExtraTime = false, inFirstHalfStoppage = false;
  const teamHistory = [[], []];
  let systemHistory = [];
  let minuteEventsLog = [];
  const formatMinute = m => inFirstHalfStoppage && m > 45 ? '45+' + (m - 45) : (!inExtraTime && m > 90 && m <= 99 ? '90+' + (m - 90) : String(m));
  const log = (i, player, emoji, m = minute, extra = '') => {
    const name = player ? player.name : teams[i].name;
    minuteEventsLog.push({ team: i, text: name + ' ' + emoji + (extra ? ' ' + extra : '') + ' ' + formatMinute(m) + "'" });
  };
  const giveYellow = (teamIndex, player) => {
    if (!player || player.position === 'GK') return;
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
  // Each team gets a different form level for this match, creating variety between rematches.
  // Form affects attacking flow and shot quality, but does not replace player/team ratings.
  const matchForm = teams.map(() => Math.random() * .36 - .18);
  const formDifference = () => matchForm[0] - matchForm[1];
  // Red cards sharply increase the opponent's shot volume.
  // Each additional red card doubles the impact of the previous one.
  const redCardImpact = i => {
    let redCards = 0;
    return teams[i].players.reduce((impact, player) => {
      if (!player.sentOff) return impact;
      const position = String(player.position || '').toUpperCase();
      const multiplier = 2 ** redCards;
      redCards++;
      impact.overall += 4 * multiplier;
      if (['ST', 'CF', 'LW', 'RW'].includes(position)) {
        impact.ownShots += .40 * multiplier;
        impact.opponentShots += .20 * multiplier;
      } else if (['CAM', 'CM', 'CDM', 'LM', 'RM'].includes(position)) {
        impact.ownShots += .20 * multiplier;
        impact.opponentShots += .45 * multiplier;
      } else if (position === 'GK') {
        impact.ownShots += .08 * multiplier;
        impact.opponentShots += .60 * multiplier;
      } else {
        impact.ownShots += .08 * multiplier;
        impact.opponentShots += .70 * multiplier;
      }
      return impact;
    }, { ownShots: 0, opponentShots: 0, opponentScoring: 0, overall: 0 });
  };
  const matchOverall = i => teams[i].overall - redCardImpact(i).overall;
  // Better teams still get more attacking phases, but match form can narrow or widen the gap.
  const pickAttack = () => Math.random() < Math.max(.28, Math.min(.72, .5 + (matchOverall(0) - matchOverall(1)) * .009 + formDifference() * .25)) ? 0 : 1;
  const addPossession = i => { stats[i].possession++; };
  const scoreGoal = (i, scorer, kind = 'normal') => {
    score[i]++;
    performanceFor(i, scorer).goals++;
    if (kind === 'penalty') {
      log(i, scorer, EMOJI.penaltyGoal);
      return;
    }
    log(i, scorer, EMOJI.goal);
    scorerGoals.set(scorer.id, (scorerGoals.get(scorer.id) || 0) + 1);
    const teammates = field(teams[i]).filter(p => p.id !== scorer.id);
    if (teammates.length && Math.random() < .70) {
      const assister = choosePlayer(teammates, p => p.dribbling + p.effective * .25);
      if (assister) {
        performanceFor(i, assister).assists++;
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
      if (event.team === null && event.text.includes('HALF-TIME')) {
        // Put the halftime divider at the end of both first-half event columns.
        teamHistory[0].push('━━━━━━━━━━━━━━━━━━━━\n**HALF-TIME**\n━━━━━━━━━━━━━━━━━━━━');
        teamHistory[1].push('━━━━━━━━━━━━━━━━━━━━\n**HALF-TIME**\n━━━━━━━━━━━━━━━━━━━━');
      }
      else if (event.team === null) systemHistory.push(event.text);
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
      try {
        // Never let a slow Discord message edit hold the match clock forever.
        await Promise.race([
          currentMessage.edit({ embeds: [makeEmbed()] }),
          sleep(15000).then(() => { throw new Error('Friendly match message edit timed out'); }),
        ]);
      } catch (error) {
        console.error('[friendly] Live message edit failed; sending a replacement:', error);
        currentMessage = await interaction.followUp({ embeds: [makeEmbed()], fetchReply: true });
      }
    }
    await sleep(1100);
    // Keep the penalty announcement visible for an extra three seconds before the kick.
    if (minuteEventsLog.some(event => event.text.includes('PENALTY TO '))) await sleep(3000);
  };

  function shot(ai) {
    const at = teams[ai], defending = teams[1 - ai];
    // Any outfield player can score; attackers are favored, but midfielders and defenders remain eligible.
    const p = choosePlayer(field(at), x => {
      const positionBoost = ['ST', 'CF', 'LW', 'RW'].includes(x.position) ? 1.45
        : ['CAM', 'CM', 'CDM', 'LM', 'RM'].includes(x.position) ? 1.2 : 0.85;
      const previousGoals = scorerGoals.get(x.id) || 0;
      // Ratings and attacking positions help, but scoring once reduces the chance of monopolizing every goal.
      return (x.shooting * .75 + x.dribbling * .25 + x.effective * .08) * positionBoost / (1 + previousGoals * .85);
    });
    if (!p) return;
    stats[ai].shots++;
    const g = getKeeper(defending);
    const edge = matchOverall(ai) - matchOverall(1 - ai);
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
    // Give stronger teams a clear edge while keeping upsets possible.
    const formBoost = (matchForm[ai] - matchForm[1 - ai]) * .12;
    const defendingRedCardImpact = redCardImpact(1 - ai);
    // Keep finishing rates realistic; ratings give an edge without deciding every shot.
    const chance = Math.max(.04, Math.min(.32, .14 + edge * .0015 + (p.shooting - g.goalkeeping) * .001 + formBoost + defendingRedCardImpact.opponentScoring));
    if (Math.random() < chance) {
      stats[ai].sot++;
      scoreGoal(ai, p);
    } else if (Math.random() < .25) {
      stats[ai].sot++;
      stats[1 - ai].saves++;
      if (g.position === 'GK') performanceFor(1 - ai, g).saves++;
      log(1 - ai, g, EMOJI.save, minute, '(' + p.name + ')');
      if (Math.random() < .22) pending.push(() => corner(ai));
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
    // The highest-rated eligible attacker takes the penalty.
    const attackers = field(t).filter(p => ['ST', 'CF', 'LW', 'RW', 'CAM'].includes(p.position));
    const kicker = (attackers.length ? attackers : field(t))
      .reduce((best, p) => !best || p.effective > best.effective ? p : best, null);
    if (!kicker) return null;
    pending.push(() => {
      if (Math.random() < Math.max(.72, Math.min(.91, .82 + (kicker.shooting - g.goalkeeping) / 500))) {
        stats[ai].shots++; stats[ai].sot++; scoreGoal(ai, kicker, 'penalty');
      } else {
        stats[ai].shots++; stats[1 - ai].saves++;
        if (g.position === 'GK') performanceFor(1 - ai, g).saves++;
        log(ai, kicker, EMOJI.missedPenalty);
      }
    });
    return kicker;
  }
  function foul() {
    const oi = Math.random() < .5 ? 0 : 1, ai = 1 - oi;
    const offender = choosePlayer(field(teams[oi]).filter(p => p.position !== 'GK'), p => p.defense + p.effective * .2);
    const victim = choosePlayer(field(teams[ai]), p => p.effective);
    if (!offender || !victim) return;
    stats[oi].fouls++;
    if (offender.position !== 'GK' && Math.random() < .025) {
      offender.sentOff = true;
      log(oi, offender, EMOJI.red);
    } else if (Math.random() < .20) {
      giveYellow(oi, offender);
    }
    pending.push(() => {
      if (Math.random() < .045) {
        // A penalty is accompanied by a yellow card for the player who committed the foul.
        giveYellow(oi, offender);
        const kicker = penalty(ai);
        if (kicker) minuteEventsLog.push({ team: ai, text: '**⚠️ PENALTY TO ' + kicker.name.toUpperCase() + '!**' });
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
    if (r < .09) foul();
    else if (r < .16) corner(possessionTeam);
    else {
      // More attacks lead to attempts, with a noticeable boost for the stronger side.
      const overallGap = matchOverall(possessionTeam) - matchOverall(1 - possessionTeam);
      const attackingRedCardImpact = redCardImpact(possessionTeam);
      const defendingRedCardImpact = redCardImpact(1 - possessionTeam);
      const shotChance = Math.max(.12, Math.min(.70, .32 + overallGap * .0015 + (matchForm[possessionTeam] - matchForm[1 - possessionTeam]) * .12 - attackingRedCardImpact.ownShots + defendingRedCardImpact.opponentShots));
      if (r < .16 + shotChance) shot(possessionTeam);
    }
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
  const firstHalfStoppage = 1 + Math.floor(Math.random() * 3);
  inFirstHalfStoppage = true;
  for (let extra = 1; extra <= firstHalfStoppage || pending.length; extra++) {
    if (extra > 8) break;
    minute = 45 + extra; minuteEventsLog = [];
    if (extra > 1 || pending.length) playMinute();
    await publish();
  }
  inFirstHalfStoppage = false;
  minuteEventsLog = [{ team: null, text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n**HALF-TIME**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' }];
  await publish();
  minute = 45;
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
    inExtraTime = true;
    minute = 90;
    await playPeriod(105);
    minuteEventsLog = [{ team: null, text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n**EXTRA-TIME HALF-TIME**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' }];
    await publish();
    await playPeriod(120);
    inExtraTime = false;
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
  const performances = [...playerPerformance.values()];
  // A sent-off player cannot win MOTM unless they scored at least five goals.
  const eligiblePerformances = performances.filter(p => !p.player.sentOff || p.goals >= 5);
  // If anyone scored, assist-only and defensive performances cannot beat a goalscorer.
  const goalScorers = eligiblePerformances.filter(p => p.goals > 0);
  const motmPool = goalScorers.length ? goalScorers : eligiblePerformances;
  const motmCandidates = motmPool.map(p => {
    const isGoalkeeper = p.player.position === 'GK';
    const isDefender = ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p.player.position);
    const conceded = score[1 - p.teamIndex];
    const contributions = p.goals + p.assists;

    // Goals carry much more weight than assists when comparing scorers.
    let weight = 1 + p.goals * 12 + p.assists * 2;

    // Defenders can still win, especially in a clean sheet, but OVR alone
    // does not decide the award.
    if (isGoalkeeper && p.saves > 0) {
      weight += p.saves * 1.5;
      if (conceded === 0) weight += 2;
    } else if (isDefender && conceded <= 1) {
      weight += 2 + Math.max(0, p.player.defense - 60) / 30;
      if (conceded === 0) weight += 2;
    }

    return { ...p, contributions, weight };
  });

  // Weighted selection keeps attacking contributions favored while allowing
  // standout defensive performances to win occasionally.
  const totalWeight = motmCandidates.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * totalWeight;
  let standout = motmCandidates[motmCandidates.length - 1];
  for (const candidate of motmCandidates) {
    roll -= candidate.weight;
    if (roll <= 0) {
      standout = candidate;
      break;
    }
  }

  const motm = {
    player: standout.player,
    team: teams[standout.teamIndex],
    reason: standout.contributions > 0
      ? standout.goals + ' goals, ' + standout.assists + ' assists'
      : standout.player.position === 'GK'
        ? standout.saves + ' saves'
        : ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(standout.player.position)
          ? 'Outstanding defensive performance'
          : 'Strong all-round performance'
  };
  const totalPossession = stats[0].possession + stats[1].possession;
  const percentages = stats.map(s => totalPossession ? Math.round(s.possession / totalPossession * 100) : 50);
  const resultStats = stats.map((s, i) => ({
    ...s,
    goals: score[i],
    possession: percentages[i],
  }));
  return { score, pens, winner, stats: resultStats, motm };
}
