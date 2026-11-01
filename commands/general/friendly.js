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
  const teams = [home, away], score = [0, 0], pending = [];
  const scorerGoals = new Map();
  const goalTimeline = [];
  const playerPerformance = new Map();
  const performanceFor = (teamIndex, player) => {
    const key = teamIndex + ':' + player.id;
    if (!playerPerformance.has(key)) playerPerformance.set(key, { player, teamIndex, goals: 0, assists: 0, saves: 0, missedPenalties: 0, yellowCards: 0, redCards: 0, ownGoals: 0 });
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
  const secondHalfHistory = [[], []];
  let currentHalf = 0;
  const kickoffText = '**━━━━━━━━━━━━━━━━━━━━ KICK-OFF ━━━━━━━━━━━━━━━━━━━━**';
  let halfTimeText = null;
  let systemHistory = [];
  const penaltyHistory = [[], []];
  let inPenaltyShootout = false;
  let minuteEventsLog = [];
  const formatMinute = m => inFirstHalfStoppage && m > 45 ? '45+' + (m - 45) : (!inExtraTime && m > 90 && m <= 99 ? '90+' + (m - 90) : String(m));
  const log = (i, player, emoji, m = minute, extra = '') => {
    const name = player ? player.name : teams[i].name;
    minuteEventsLog.push({ team: i, text: name + ' ' + emoji + (extra ? ' ' + extra : '') + ' ' + formatMinute(m) + "'" });
  };
  const giveYellow = (teamIndex, player) => {
    if (!player || player.position === 'GK') return;
    player.yellow++;
    performanceFor(teamIndex, player).yellowCards++;
    log(teamIndex, player, EMOJI.yellow);
    if (player.yellow >= 2) {
      player.sentOff = true;
      performanceFor(teamIndex, player).redCards++;
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
  // Red cards give the opponent an advantage, but the effect grows gradually.
  // Each additional red card has a smaller extra impact than before.
  const redCardImpact = i => {
    let redCards = 0;
    return teams[i].players.reduce((impact, player) => {
      if (!player.sentOff) return impact;
      const position = String(player.position || '').toUpperCase();
      const multiplier = 1.6 ** redCards;
      redCards++;
      impact.overall += 3 * multiplier;
      if (['ST', 'CF', 'LW', 'RW'].includes(position)) {
        impact.ownShots += .32 * multiplier;
        impact.opponentShots += .16 * multiplier;
      } else if (['CAM', 'CM', 'CDM', 'LM', 'RM'].includes(position)) {
        impact.ownShots += .16 * multiplier;
        impact.opponentShots += .36 * multiplier;
      } else if (position === 'GK') {
        impact.ownShots += .06 * multiplier;
        impact.opponentShots += .48 * multiplier;
      } else {
        impact.ownShots += .06 * multiplier;
        impact.opponentShots += .56 * multiplier;
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
    goalTimeline.push({ teamIndex: i, player: scorer });
    if (kind === 'penalty') {
      log(i, scorer, EMOJI.penaltyGoal);
      return;
    }
    log(i, scorer, EMOJI.goal);
    scorerGoals.set(i + ':' + scorer.id, (scorerGoals.get(i + ':' + scorer.id) || 0) + 1);
    const teammates = field(teams[i]).filter(p => p.id !== scorer.id);
    if (teammates.length && Math.random() < .70) {
      const assister = choosePlayer(teammates, p => p.dribbling + p.effective * .25);
      if (assister) {
        performanceFor(i, assister).assists++;
        minuteEventsLog.push({ team: i, text: '　• ' + assister.name + ' ' + EMOJI.assist });
      }
    }
  };
  const makeEmbed = () => {
    const fields = [
      { name: '\u200B', value: kickoffText, inline: false },
      { name: home.name, value: '\u200B\n\n' + (teamHistory[0].join('\n\n').slice(-1024) || 'No events yet.'), inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: away.name, value: '\u200B\n\n' + (teamHistory[1].join('\n\n').slice(-1024) || 'No events yet.'), inline: true },
    ];
    if (halfTimeText) {
      fields.push({ name: '\u200B', value: halfTimeText, inline: false });
      fields.push(
        { name: '\u200B', value: '\u200B\n\n' + (secondHalfHistory[0].join('\n\n').slice(-1024) || 'No events yet.'), inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '\u200B', value: '\u200B\n\n' + (secondHalfHistory[1].join('\n\n').slice(-1024) || 'No events yet.'), inline: true },
      );
    }
    fields.push(...systemHistory.map(text => ({ name: '\u200B', value: text, inline: false })));
    if (inPenaltyShootout) {
      fields.push(
        { name: home.name, value: '\u200B\n\n' + (penaltyHistory[0].join('\n\n').slice(-1024) || 'Waiting for penalties...'), inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: away.name, value: '\u200B\n\n' + (penaltyHistory[1].join('\n\n').slice(-1024) || 'Waiting for penalties...'), inline: true },
      );
    }
    return new EmbedBuilder().setColor(0x3498db)
      .setTitle('⚽ FRIENDLY MATCH · ' + formatMinute(minute) + "'")
      .setDescription('**⏱️ ' + formatMinute(minute) + "'**\n**" + home.name + '** ' + score[0] + '–' + score[1] + ' **' + away.name + '**')
      .addFields(fields)
      .setFooter({ text: 'Match events' });
  };
  const publish = async () => {
    for (const event of minuteEventsLog) {
      if (event.team === null) {
        if (event.text.includes('HALF-TIME') && !event.text.includes('EXTRA-TIME')) halfTimeText = '**--------------------------HALFTIME--------------------------**';
        else systemHistory.push(event.text);
      }
      else if (inPenaltyShootout) {
        penaltyHistory[event.team].push(event.text);
      }
      else {
        const history = currentHalf === 0 ? teamHistory : secondHalfHistory;
        if (event.text.startsWith('　• ') && history[event.team].length) history[event.team][history[event.team].length - 1] += '\n' + event.text;
        else history[event.team].push(event.text);
      }
    }
    const totalLength = [...teamHistory, ...secondHalfHistory].flat().join('\n').length + systemHistory.join('\n').length;
    if (!currentMessage || totalLength > 6500) {
      teamHistory[0] = teamHistory[0].slice(-18);
      teamHistory[1] = teamHistory[1].slice(-18);
      secondHalfHistory[0] = secondHalfHistory[0].slice(-18);
      secondHalfHistory[1] = secondHalfHistory[1].slice(-18);
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
      const previousGoals = scorerGoals.get(ai + ':' + x.id) || 0;
      // Ratings and attacking positions help, but scoring once reduces the chance of monopolizing every goal.
      return (x.shooting * .75 + x.dribbling * .25 + x.effective * .08) * positionBoost / (1 + previousGoals * .85);
    });
    if (!p) return;
    stats[ai].shots++;
    const g = getKeeper(defending);
    const edge = matchOverall(ai) - matchOverall(1 - ai);
    // Own goals are rare, with defenders most at risk. Lower-rated players
    // are more likely to be selected, while every position can score one.
    if (Math.random() < .008) {
      const ownGoalPlayer = choosePlayer(activePlayers(defending), x => {
        const position = String(x.position || '').toUpperCase();
        const positionWeight = ['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position) ? 6
          : ['CAM', 'CM', 'CDM', 'LM', 'RM'].includes(position) ? 2.5
          : ['GK'].includes(position) ? 1.8 : 0.9;
        const ratingWeight = Math.max(.55, Math.min(1.65, 1.6 - (x.effective - 60) * .025));
        return positionWeight * ratingWeight;
      });
      if (ownGoalPlayer) {
        stats[ai].sot++;
        score[ai]++;
        performanceFor(1 - ai, ownGoalPlayer).ownGoals++;
        minuteEventsLog.push({ team: 1 - ai, text: ownGoalPlayer.name + ' ' + EMOJI.ownGoal + ' ' + formatMinute(minute) + "'" });
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
        performanceFor(ai, kicker).missedPenalties++;
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
      performanceFor(oi, offender).redCards++;
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
  minuteEventsLog = [];
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
  minuteEventsLog = [{ team: null, text: '**HALF-TIME**' }];
  currentHalf = 1;
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
  // TEMPORARY TEST SWITCH: set to false to restore normal full-time/extra-time rules.
  const FORCE_PENALTIES = true;
  if (score[0] !== score[1] && !FORCE_PENALTIES) {
    minuteEventsLog = [{ team: null, text: '**--------------------------FULL-TIME--------------------------**' }];
    await publish();
  } else {
    if (!FORCE_PENALTIES) {
      minuteEventsLog = [{ team: null, text: '**--------------------------EXTRA TIME--------------------------**' }];
      await publish();
      inExtraTime = true;
      minute = 90;
      await playPeriod(105);
      minuteEventsLog = [{ team: null, text: '**--------------------------EXTRA-TIME HALFTIME--------------------------**' }];
      await publish();
      await playPeriod(120);
      inExtraTime = false;
    }
    if (score[0] === score[1] || FORCE_PENALTIES) {
      inPenaltyShootout = true;
      minuteEventsLog = [{ team: null, text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ **PENALTY SHOOTOUT** ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' }];
      await publish();
      pens = [0, 0];
      const penaltyOrder = t => {
        const rank = p => ['ST', 'CF', 'LW', 'RW', 'CAM'].includes(p.position) ? 0
          : ['CM', 'CDM', 'LM', 'RM'].includes(p.position) ? 1
          : p.position === 'GK' ? 3 : 2;
        return activePlayers(t).slice().sort((a, b) => rank(a) - rank(b) || b.effective - a.effective);
      };
      const orders = teams.map(penaltyOrder);
      const attempts = [0, 0];
      const kick = async i => {
        const p = orders[i][attempts[i] % orders[i].length];
        attempts[i]++;
        const g = getKeeper(teams[1 - i]);
        const goal = Math.random() < Math.max(.74, Math.min(.93, .84 + (p.shooting - g.goalkeeping) / 500));
        if (goal) pens[i]++;
        minuteEventsLog = [{
          team: i,
          text: p.name + ' ' + (goal ? EMOJI.penaltyGoal : EMOJI.missedPenalty)
            + ' **' + pens[0] + '–' + pens[1] + '** (Penalty #' + attempts[i] + ')'
        }];
        await publish();
        await sleep(2000);
      };
      // Best of five: finish as soon as the other team cannot catch up.
      let decided = false;
      for (let round = 0; round < 5 && !decided; round++) {
        await kick(0);
        if (pens[0] > pens[1] + (5 - attempts[1])) {
          decided = true;
          break;
        }
        await kick(1);
        if (pens[1] > pens[0] + (5 - attempts[0])) decided = true;
      }
      // If tied after five each, continue in paired sudden-death rounds.
      while (!decided && pens[0] === pens[1]) {
        await kick(0);
        await kick(1);
        if (pens[0] !== pens[1]) decided = true;
      }
    } else {
      minuteEventsLog = [{ team: null, text: '**--------------------------FULL-TIME--------------------------**' }];
      await publish();
    }
  }
  const winner = pens ? (pens[0] > pens[1] ? 0 : 1) : (score[0] === score[1] ? null : (score[0] > score[1] ? 0 : 1));
  const performances = [...playerPerformance.values()];
  const defenders = ['CB', 'LB', 'RB', 'LWB', 'RWB'];
  const motmCandidates = performances.map(p => {
    const isGoalkeeper = p.player.position === 'GK';
    const isDefender = defenders.includes(p.player.position);
    const cleanSheet = score[1 - p.teamIndex] === 0 && !p.player.sentOff;
    let points = p.goals * 6
      + p.assists * 4
      + p.saves * 2
      - p.missedPenalties * 3
      - p.yellowCards * 2
      - p.redCards * 8
      - p.ownGoals * 6;

    if (cleanSheet && isGoalkeeper) points += 4;
    else if (cleanSheet && isDefender) points += 5;
    if (p.goals >= 3) points += 3;
    if (p.assists >= 2) points += 2;

    // Award +2 for the goal that established the eventual winning margin.
    if (!pens && winner !== null) {
      const runningScore = [0, 0];
      for (const goal of goalTimeline) {
        runningScore[goal.teamIndex]++;
        if (goal.teamIndex === winner && runningScore[winner] === score[1 - winner] + 1
          && goal.player && goal.player.id === p.player.id && goal.teamIndex === p.teamIndex) {
          points += 2;
          break;
        }
      }
    }
    return { ...p, points };
  });

  // Highest points wins. Ties are broken by goals, assists, then saves.
  motmCandidates.sort((a, b) =>
    b.points - a.points ||
    b.goals - a.goals ||
    b.assists - a.assists ||
    b.saves - a.saves
  );
  const standout = motmCandidates[0];
  const motm = {
    player: standout.player,
    team: teams[standout.teamIndex],
    reason: standout.points + ' MOTM points (' +
      standout.goals + ' goals, ' + standout.assists + ' assists, ' +
      standout.saves + ' saves)'
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
