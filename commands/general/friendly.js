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
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function playerLabel(player, team) { return '**' + player.name + '** (<@' + team.id + '>)'; }
async function runLiveMatch(interaction, home, away) {
  const teams=[home,away], score=[0,0], pending=[];
  let pens=null, minute=0, minuteEventsLog=[], historyText='', currentMessage=null;
  const log=s=>minuteEventsLog.push(s);
  const label=(i,p)=>playerLabel(p,teams[i]);
  const active=t=>t.players.filter(p=>!p.sentOff);
  const field=t=>active(t).filter(p=>p.position!=='GK');
  const choose=(list,fn)=>{if(!list.length)return null;const w=list.map(p=>Math.max(1,fn(p)));let n=Math.random()*w.reduce((a,b)=>a+b,0);for(let i=0;i<list.length;i++){n-=w[i];if(n<=0)return list[i];}return list[list.length-1];};
  const keeper=t=>t.players.find(p=>p.position==='GK'&&!p.sentOff)||{name:'Emergency goalkeeper',goalkeeping:18};
  const attackers=t=>active(t).filter(p=>['ST','CF','LW','RW','CAM'].includes(p.position));
  const makeEmbed=body=>new EmbedBuilder().setColor(0x3498db).setTitle('⏱️ LIVE FRIENDLY MATCH')
    .setDescription('**'+home.name+'** '+score[0]+'–'+score[1]+' **'+away.name+'**\n\n🕒 **'+(minute>90?'90+'+(minute-90):String(minute).padStart(2,'0'))+':00**\n\n'+body)
    .addFields({name:home.name,value:home.overall+' OVR',inline:true},{name:away.name,value:away.overall+' OVR',inline:true})
    .setFooter({text:'Match history • Event-paced clock'});
  const appendHistory=async(m,items)=>{
    const stamp=m>90?'90+'+(m-90):String(m);
    const section='**'+(m===0?'KICK-OFF':('Minute '+stamp+' · '+home.name+' '+score[0]+'–'+score[1]+' '+away.name))+'**\n'+(items.length?items.join('\n'):'No major event this minute.');
    const next=historyText?historyText+'\n\n'+section:section;
    if(!currentMessage||next.length>3300){historyText=section;currentMessage=await interaction.followUp({embeds:[makeEmbed(historyText)],fetchReply:true});}
    else{historyText=next;await currentMessage.edit({embeds:[makeEmbed(historyText)]});}
  };
  const publish=async m=>{await appendHistory(m,minuteEventsLog);await sleep(minuteEventsLog.length?4000:2000);};
  const pickAttack=()=>Math.random()<Math.max(.25,Math.min(.75,.5+(home.overall-away.overall)*.012))?0:1;

  function shot(ai) {
    const at=teams[ai],dt=teams[1-ai],pool=attackers(at),p=choose(pool.length?pool:field(at),x=>x.shooting+x.dribbling*.3+x.effective*.2);
    if(!p)return;
    const g=keeper(dt),edge=at.overall-dt.overall;
    const chance=Math.max(.10,Math.min(.68,.23+edge*.012+(p.shooting-g.goalkeeping)*.002));
    if(Math.random()<chance){score[ai]++;log('⚽ **GOAL!** '+label(ai,p)+' finishes past '+label(1-ai,g)+' to score for **'+at.name+'**!');}
    else {
      const lines=[label(ai,p)+' shoots, but '+label(1-ai,g)+' gets down quickly and makes the save!',label(ai,p)+' fires towards goal — '+label(1-ai,g)+' pushes it away!',label(ai,p)+' gets a shot away, but '+label(1-ai,g)+' stands tall and keeps it out!',label(ai,p)+' strikes it cleanly, but '+label(1-ai,g)+' palms it wide!'];
      log('🧤 '+lines[Math.floor(Math.random()*lines.length)]);
      if(Math.random()<.20)pending.push(()=>corner(ai,'The saved shot goes behind for a corner.'));
    }
  }
  function corner(ai,reason) {
    const t=teams[ai],taker=choose(field(t),p=>p.effective+p.overall*.1);
    if(!taker)return;
    log('🚩 **CORNER TO '+t.name+'!** '+label(ai,taker)+' places the ball in the corner. '+reason);
    const target=choose(attackers(t).filter(p=>p.id!==taker.id),p=>p.effective+p.shooting*.3);
    if(target)pending.push(()=>{
      if(Math.random()<.17){score[ai]++;log('⚽ '+label(ai,taker)+' swings it in and '+label(ai,target)+' heads home! **GOAL for '+t.name+'!**');}
      else if(Math.random()<.48)log(label(ai,target)+' gets on the end of '+label(ai,taker)+'’s delivery, but heads just wide.');
      else{const d=choose(field(teams[1-ai]),p=>p.defense+p.effective*.2);log((d?label(1-ai,d):teams[1-ai].name)+' gets up and clears '+label(ai,taker)+'’s corner.');}
    });
  }
  function freeKick(ai,victim) {
    const t=teams[ai],taker=choose(field(t),p=>p.shooting*.6+p.effective*.4);
    if(!taker)return;
    log('🎯 **FREE KICK — '+t.name+'** '+label(ai,taker)+' steps up after the foul on '+label(ai,victim)+'.');
    pending.push(()=>{
      if(Math.random()<.30)shot(ai);
      else{const d=choose(field(teams[1-ai]),p=>p.defense+p.effective*.2);log(label(ai,taker)+' sends it into the area, but '+(d?label(1-ai,d):teams[1-ai].name)+' heads it clear.');}
    });
  }
  function penalty(ai) {
    const t=teams[ai],g=keeper(teams[1-ai]),k=choose(field(t),p=>p.shooting+p.effective*.2);
    if(!k)return;
    log('🚨 **PENALTY TO '+t.name+'!** '+label(ai,k)+' places the ball on the spot. '+label(1-ai,g)+' gets ready...');
    pending.push(()=>{if(Math.random()<Math.max(.66,Math.min(.88,.77+(k.shooting-g.goalkeeping)/500))){score[ai]++;log('⚽ **GOAL!** '+label(ai,k)+' sends the penalty past '+label(1-ai,g)+'!');}else log('🧤 '+label(1-ai,g)+' guesses correctly and saves '+label(ai,k)+'’s penalty!');});
  }
  function foul() {
    const oi=Math.random()<.5?0:1,ai=1-oi,off=choose(field(teams[oi]),p=>p.defense+p.effective*.2),victim=choose(field(teams[ai]),p=>p.effective);
    if(!off||!victim)return;
    log('⚠️ '+label(oi,off)+' brings down '+label(ai,victim)+'. The referee stops play.');
    if(Math.random()<.025){off.sentOff=true;log('🟥 **STRAIGHT RED!** '+label(oi,off)+' is sent off.');}
    else if(Math.random()<.20){off.yellow++;if(off.yellow>=2){off.sentOff=true;log('🟨🟥 **SECOND YELLOW!** '+label(oi,off)+' is sent off.');}else log('🟨 **YELLOW CARD!** '+label(oi,off)+' is booked.');}
    pending.push(()=>{if(Math.random()<.045)penalty(ai);else freeKick(ai,victim);});
  }
  function playMinute() {
    if(pending.length){pending.shift()();return;}
    const r=Math.random();
    if(r<.10)foul();
    else if(r<.17)corner(pickAttack(),'Attacking pressure forces the ball behind.');
    else if(r<.45)shot(pickAttack());
    else if(r<.53){const i=pickAttack(),p=choose(field(teams[i]),x=>x.effective+x.dribbling*.2),q=p&&choose(field(teams[i]).filter(x=>x.id!==p.id),x=>x.effective+x.passing*.2);if(p&&q)log('🔄 '+label(i,p)+' finds '+label(i,q)+' with a neat pass as **'+teams[i].name+'** build an attack.');}
  }
  const playPeriod=async(end)=>{for(let m=minute+1;m<=end;m++){minute=m;minuteEventsLog=[];playMinute();await publish(m);}};
  log('🔔 **KICK-OFF!** '+home.name+' get the match underway against '+away.name+'.');
  await appendHistory(0,minuteEventsLog);
  await playPeriod(45);
  minuteEventsLog=[];log('⏸️ **HALF-TIME!** '+home.name+' '+score[0]+'–'+score[1]+' '+away.name+'.');await publish(45);
  await playPeriod(90);
  const stoppage=2+Math.floor(Math.random()*3);
  for(let extra=1;extra<=stoppage||pending.length;extra++){
    if(extra>8)break;
    minute=90+extra;minuteEventsLog=[];
    if(extra===1)log('⏱️ The referee adds '+stoppage+' minutes of stoppage time.');
    else playMinute();
    await publish(minute);
  }
  minuteEventsLog=[];log('⏱️ **FULL-TIME!** '+home.name+' '+score[0]+'–'+score[1]+' '+away.name+'.');await appendHistory(minute,minuteEventsLog);
  if(score[0]===score[1]){
    minuteEventsLog=[];log('⏳ The match is level. Two 15-minute periods of extra time!');await publish(minute);
    await playPeriod(minute+15);
    minuteEventsLog=[];log('⏸️ **EXTRA-TIME BREAK.**');await publish(minute);
    await playPeriod(minute+15);
    minuteEventsLog=[];log('⏱️ **END OF EXTRA TIME!**');await appendHistory(minute,minuteEventsLog);
  }
  if(score[0]===score[1]){
    pens=[0,0];minuteEventsLog=[];log('🎯 Still level! It is time for a penalty shootout.');await publish(minute);
    const kick=async i=>{const t=teams[i],g=keeper(teams[1-i]),p=choose(field(t),x=>x.shooting+x.effective*.2);if(!p)return;minuteEventsLog=[];log('🎯 **PENALTY SHOOTOUT — '+t.name+'** '+label(i,p)+' steps up.');await publish(minute);minuteEventsLog=[];const goal=Math.random()<Math.max(.66,Math.min(.86,.76+(p.shooting-g.goalkeeping)/500));if(goal)pens[i]++;log((goal?'⚽ **SCORES!** ':'🧤 **SAVED!** ')+label(i,p)+(goal?' finds the net past '+label(1-i,g)+'.':' is denied by '+label(1-i,g)+'.')+' Shootout: **'+pens[0]+'–'+pens[1]+'**.');await publish(minute);};
    for(let r=0;r<5;r++){for(let i=0;i<2;i++)await kick(i);const left=4-r;if(pens[0]>pens[1]+left||pens[1]>pens[0]+left)break;}
    while(pens[0]===pens[1]){await kick(0);await kick(1);}
  }
  const winner=pens?(pens[0]>pens[1]?0:1):(score[0]===score[1]?null:(score[0]>score[1]?0:1));
  const finishText=winner===null?'🤝 **The friendly ends in a draw!**':'🏆 **'+teams[winner].name+' win the friendly!**';
  await interaction.followUp({embeds:[makeEmbed(finishText).setTitle('🏁 MATCH FINISHED')]});
  return {score,pens,winner};
}
