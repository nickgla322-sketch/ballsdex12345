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
      const result = playMatch(home, away);
      const events = result.events;
      for (let i = 0; i < events.length; i += 10) {
        const page = events.slice(i, i + 10).map(e => '**' + e.minute + "'** " + e.text).join('\n\n');
        const embed = new EmbedBuilder().setColor(0x3498db).setTitle('📋 MATCH COMMENTARY' + (i ? ' · PART ' + (i / 10 + 1) : '')).setDescription(page.slice(0, 4000)).setFooter({ text: home.name + ' ' + result.score[0] + '–' + result.score[1] + ' ' + away.name });
        await interaction.followUp({ embeds: [embed] });
      }
      const winner = result.winner === null ? 'The friendly ends in a draw.' : '🏆 **' + (result.winner === 0 ? home.name : away.name) + '** win the friendly!';
      const summary = new EmbedBuilder().setColor(result.winner === null ? 0x95a5a6 : 0xf1c40f).setTitle('🏁 FINAL RESULT').setDescription('**' + home.name + ' ' + result.score[0] + '–' + result.score[1] + ' ' + away.name + '**' + (result.pens ? '\nPenalty shootout: **' + result.pens[0] + '–' + result.pens[1] + '**' : '') + '\n\n' + winner).addFields({ name: home.name, value: home.overall + ' OVR · ' + active(home).length + '/8 players remaining', inline: true }, { name: away.name, value: away.overall + ' OVR · ' + active(away).length + '/8 players remaining', inline: true });
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
function playMatch(home, away) {
  const teams=[home,away], score=[0,0], events=[]; let minute=0;
  const log=(m,s)=>events.push({minute:m,text:s});
  function shoot(ai,m) {
    const at=teams[ai], dt=teams[1-ai], pool=active(at).filter(p=>['ST','CF','LW','RW','CAM'].includes(p.position));
    const shooter=choose(pool.length?pool:active(at).filter(p=>p.position!=='GK'),p=>p.shooting+p.dribbling*.3+p.effective*.2);
    if(!shooter)return; const gk=keeper(dt), marker=choose(active(dt).filter(p=>p.position!=='GK'),p=>p.defense+p.effective*.2);
    const atk=shooter.shooting*.5+shooter.dribbling*.15+shooter.effective*.35, def=(marker?marker.defense*.55+marker.effective*.25:20)+gk.goalkeeping*.2;
    if(Math.random()>Math.max(.07,Math.min(.48,.22+(atk-def)/260))) { if(Math.random()<.22)log(m,'🧤 **'+gk.name+'** saves a shot from **'+shooter.name+'**.'); return; }
    if(Math.random()*100+atk*.22>Math.random()*100+gk.goalkeeping*.48+20){score[ai]++;log(m,'⚽ **GOAL! '+shooter.name+'** scores for **'+at.name+'**!');} else log(m,'🧤 **'+gk.name+'** makes a huge save against **'+shooter.name+'**!');
  }
  function penalty(ai,m,why) { const t=teams[ai], d=teams[1-ai], kicker=choose(active(t).filter(p=>p.position!=='GK'),p=>p.shooting+p.effective*.2), gk=keeper(d); if(!kicker)return; const chance=Math.max(.58,Math.min(.88,.76+(kicker.shooting-gk.goalkeeping)/500)); if(Math.random()<chance){score[ai]++;log(m,'⚽ **'+kicker.name+'** converts the penalty!');}else log(m,'🧤 **'+gk.name+' SAVES IT!** '+kicker.name+"'s penalty is stopped."); }
  function foul(m) { const oi=Math.random()<.5?0:1, ti=1-oi, offender=choose(active(teams[oi]).filter(p=>p.position!=='GK'),p=>p.defense+p.effective*.2), victim=choose(active(teams[ti]).filter(p=>p.position!=='GK'),p=>p.effective); if(!offender||!victim)return; log(m,'⚠️ **'+offender.name+'** fouls **'+victim.name+'**. Free kick to **'+teams[ti].name+'**.');
    if(Math.random()<.012){offender.sentOff=true;log(m,'🟥 **STRAIGHT RED! '+offender.name+'** is sent off.');} else if(Math.random()<.12){offender.yellow++;if(offender.yellow===2){offender.sentOff=true;log(m,'🟨🟥 **SECOND YELLOW — RED! '+offender.name+'** is sent off.');}else log(m,'🟨 Yellow card for **'+offender.name+'**.');}
    if(Math.random()<.045){log(m,'🚩 **PENALTY!** '+teams[ti].name+' win a penalty.');penalty(ti,m,'foul');} else if(Math.random()<.2)shoot(ti,m);
  }
  function period(start,end) { minute=start; while(minute<end){minute=Math.min(end,minute+3+Math.floor(Math.random()*4));if(Math.random()<.18)foul(minute);if(Math.random()<.78)shoot(Math.random()<.5?0:1,minute);} }
  log(0,'🔔 Kick-off! The friendly is underway.'); period(0,45); log(45,'⏸️ **Half-time** — '+home.name+' '+score[0]+'–'+score[1]+' '+away.name+'.');
  period(45,90); log(90,'⏱️ **Full-time** — '+home.name+' '+score[0]+'–'+score[1]+' '+away.name+'.');
  if(score[0]===score[1]){log(90,'⏳ The score is level. Two 15-minute periods of extra time!');period(90,105);log(105,'⏸️ Extra-time break.');period(105,120);log(120,'⏱️ **End of extra time** — '+home.name+' '+score[0]+'–'+score[1]+' '+away.name+'.');}
  let pens=null;
  if(score[0]===score[1]){log(120,'🎯 Still level! Here comes the penalty shootout.');pens=[0,0];
    for(let r=0;r<5;r++){for(let i=0;i<2;i++)kick(i);const left=4-r;if(pens[0]>pens[1]+left||pens[1]>pens[0]+left)break;}
    while(pens[0]===pens[1]){kick(0);kick(1);}
  }
  function kick(i){const t=teams[i],g=keeper(teams[1-i]),p=choose(active(t).filter(x=>x.position!=='GK'),x=>x.shooting+x.effective*.2);if(!p)return;const goal=Math.random()<Math.max(.58,Math.min(.86,.74+(p.shooting-g.goalkeeping)/500));if(goal)pens[i]++;log(120,(goal?'⚽ ':'🧤 ')+'**'+t.name+'** — '+p.name+': **'+(goal?'SCORES':'SAVED by '+g.name)+'** ('+pens[0]+'–'+pens[1]+').');}
  const winner=pens?(pens[0]>pens[1]?0:1):(score[0]===score[1]?null:(score[0]>score[1]?0:1));
  log(120,winner===null?'🤝 **The friendly ends in a draw!**':'🏆 **'+teams[winner].name+' win the friendly!**');
  return {score,pens,winner,events};
}