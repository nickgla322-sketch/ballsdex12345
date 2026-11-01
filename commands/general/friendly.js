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
  const teams=[home,away], score=[0,0];
  let pens=null, minute=0, minuteEventsLog=[];
  let historyText='';
  let currentMessage=null;
  const log=(m,s)=>minuteEventsLog.push(s);
  const label=(i,p)=>playerLabel(p,teams[i]);
  const active=t=>t.players.filter(p=>!p.sentOff);
  const field=t=>active(t).filter(p=>p.position!=='GK');
  const choose=(list,fn)=>{if(!list.length)return null;const w=list.map(p=>Math.max(1,fn(p)));let n=Math.random()*w.reduce((a,b)=>a+b,0);for(let i=0;i<list.length;i++){n-=w[i];if(n<=0)return list[i];}return list[list.length-1];};
  const keeper=t=>t.players.find(p=>p.position==='GK'&&!p.sentOff)||{name:'Emergency goalkeeper',goalkeeping:18};
  const attackPool=t=>active(t).filter(p=>['ST','CF','LW','RW','CAM'].includes(p.position));
  const makeEmbed=(body)=>new EmbedBuilder().setColor(0x3498db).setTitle('⏱️ LIVE FRIENDLY MATCH')
    .setDescription('**'+home.name+'** '+score[0]+'–'+score[1]+' **'+away.name+'**\n\n🕒 **'+String(minute).padStart(2,'0')+':00**\n\n'+body)
    .addFields({name:home.name,value:home.overall+' OVR',inline:true},{name:away.name,value:away.overall+' OVR',inline:true})
    .setFooter({text:'Match history • Event-paced clock'});
  const appendHistory=async(m,items)=>{
    const section='**'+(m===0?'KICK-OFF':('Minute '+m))+'**\n'+(items.length?items.join('\n'):'No major event this minute.');
    const next=historyText?historyText+'\n\n'+section:section;
    // Leave room for the score, clock and team fields under Discord's embed limits.
    if(!currentMessage || next.length>3300){
      historyText=section;
      currentMessage=await interaction.followUp({embeds:[makeEmbed(historyText)],fetchReply:true});
    } else {
      historyText=next;
      await currentMessage.edit({embeds:[makeEmbed(historyText)]});
    }
  };
  const publishMinute=async(m)=>{
    await appendHistory(m,minuteEventsLog);
    // Give readers more time when a minute contains a chain of events.
    const delay=minuteEventsLog.length===0?2000:(minuteEventsLog.length===1?4000:7000);
    await sleep(delay);
  };
  log(0,'🔔 **KICK-OFF!** '+home.name+' get the match underway against '+away.name+'.');
  await appendHistory(0,minuteEventsLog);
  function corner(ai,m,reason) {
    const t=teams[ai],taker=choose(field(t),p=>p.passing+p.effective*.2);
    if(!taker)return;
    log(m,'🚩 **CORNER KICK — '+t.name+'**\n'+label(ai,taker)+' is taking the corner ('+reason+').');
    const target=choose(attackPool(t).filter(p=>p.id!==taker.id),p=>p.effective+p.shooting*.3);
    if(!target)return;
    if(Math.random()<.2){score[ai]++;log(m,'⚽ '+label(ai,taker)+' delivers and '+label(ai,target)+' rises above the defence to head it in! **GOAL for '+t.name+'!**');}
    else if(Math.random()<.5)log(m,label(ai,taker)+' delivers and '+label(ai,target)+' gets a head to it, but sends it just wide.');
    else {const defender=choose(field(teams[1-ai]),p=>p.defense+p.effective*.2);log(m,'The corner from '+label(ai,taker)+' is cleared by '+(defender?label(1-ai,defender):'**'+teams[1-ai].name+'**')+'.');}
  }
  function shoot(ai,m) {
    const at=teams[ai],dt=teams[1-ai],pool=attackPool(at),p=choose(pool.length?pool:field(at),x=>x.shooting+x.dribbling*.3+x.effective*.2);
    if(!p)return;
    const g=keeper(dt),marker=choose(field(dt),x=>x.defense+x.effective*.2);
    const atk=p.shooting*.52+p.dribbling*.14+p.effective*.34,def=(marker?marker.defense*.5+marker.effective*.2:18)+g.goalkeeping*.3;
    if(Math.random()>Math.max(.10,Math.min(.72,.38+(atk-def)/260))) {
      const lines=[label(ai,p)+' shoots, but '+label(1-ai,g)+' gets down quickly and makes the save!',label(ai,p)+' fires towards goal — '+label(1-ai,g)+' is there to catch it!',label(ai,p)+' tries from the edge of the box, and '+label(1-ai,g)+' pushes it away!',label(ai,p)+' gets a shot away. '+label(1-ai,g)+' reacts brilliantly to keep it out!',label(ai,p)+' strikes it cleanly, but '+label(1-ai,g)+' palms the effort wide!'];
      log(m,'🧤 '+lines[Math.floor(Math.random()*lines.length)]);
      if(Math.random()<.32)corner(ai,m,'goalkeeper save');
      return;
    }
    if(Math.random()*100+atk*.22>Math.random()*100+g.goalkeeping*.48+20){
      score[ai]++;
      const lines=['⚽ **GOAL!** '+label(ai,p)+' finds the net past '+label(1-ai,g)+' for **'+at.name+'**!','⚽ **GOAL!** What a finish! '+label(ai,p)+' beats '+label(1-ai,g)+' to score for **'+at.name+'**!','⚽ **GOAL!** '+label(ai,p)+' places it beyond '+label(1-ai,g)+'. **'+at.name+'** score!'];
      log(m,lines[Math.floor(Math.random()*lines.length)]);
    } else {
      const lines=['🧤 '+label(1-ai,g)+' makes a fantastic diving save to deny '+label(ai,p)+'!','🧤 '+label(ai,p)+' gets power behind the shot, but '+label(1-ai,g)+' blocks it!','🧤 '+label(1-ai,g)+' stands tall and keeps out '+label(ai,p)+'’s effort!'];
      log(m,lines[Math.floor(Math.random()*lines.length)]);
      if(Math.random()<.3)corner(ai,m,'deflected shot');
    }
  }
  function freeKick(ai,m,victim) {
    const t=teams[ai],taker=choose(field(t),p=>p.shooting*.65+p.passing*.35+p.effective*.2);
    if(!taker)return;
    log(m,'🎯 **FREE KICK — '+t.name+'**\n'+label(ai,taker)+' is taking it after the foul on '+label(ai,victim)+'.');
    if(Math.random()<.34)shoot(ai,m);
    else {const defender=choose(field(teams[1-ai]),p=>p.defense+p.effective*.2);log(m,label(ai,taker)+' curls the free kick into the area, but '+(defender?label(1-ai,defender):'**'+teams[1-ai].name+'**')+' heads it clear.');}
  }
  function penalty(ai,m) {
    const t=teams[ai],g=keeper(teams[1-ai]),k=choose(field(t),p=>p.shooting+p.effective*.2);
    if(!k)return;
    log(m,'🚨 **PENALTY TO '+t.name+'!**\n'+label(ai,k)+' places the ball on the spot. '+label(1-ai,g)+' is ready in goal...');
    if(Math.random()<Math.max(.56,Math.min(.88,.76+(k.shooting-g.goalkeeping)/500))){score[ai]++;log(m,'⚽ **GOAL!** '+label(ai,k)+' sends the penalty home past '+label(1-ai,g)+'!');}
    else log(m,'🧤 '+label(1-ai,g)+' guesses correctly and saves '+label(ai,k)+'’s penalty!');
  }
  function foul(m) {
    const oi=Math.random()<.5?0:1,ai=1-oi,off=choose(field(teams[oi]),p=>p.defense+p.effective*.2),victim=choose(field(teams[ai]),p=>p.effective);
    if(!off||!victim)return;
    const lines=[label(oi,off)+' clips '+label(ai,victim)+' from behind. The referee blows for a foul.',label(oi,off)+' brings down '+label(ai,victim)+'. Free kick to **'+teams[ai].name+'**.',label(oi,off)+' mistimes the challenge on '+label(ai,victim)+'. The referee stops play.'];
    log(m,'⚠️ '+lines[Math.floor(Math.random()*lines.length)]);
    if(Math.random()<.035){off.sentOff=true;log(m,'🟥 **STRAIGHT RED CARD!** '+label(oi,off)+' is sent off. **'+teams[oi].name+'** are down to '+active(teams[oi]).length+' players.');}
    else if(Math.random()<.24){off.yellow++;if(off.yellow>=2){off.sentOff=true;log(m,'🟨🟥 **SECOND YELLOW, THEN RED!** '+label(oi,off)+' is sent off.');}else log(m,'🟨 **YELLOW CARD!** The referee books '+label(oi,off)+' for the challenge.');}
    if(Math.random()<.065)penalty(ai,m);else freeKick(ai,m,victim);
  }
  function minuteEvents(m) {
    const r=Math.random();
    if(r<.105)foul(m);
    else if(r<.18)corner(Math.random()<.5?0:1,m,'attacking pressure');
    else if(r<.43)shoot(Math.random()<.5?0:1,m);
    else if(r<.49){const i=Math.random()<.5?0:1,p=choose(field(teams[i]),x=>x.passing+x.effective*.2);if(p){const teammate=choose(field(teams[i]).filter(x=>x.id!==p.id),x=>x.passing+x.effective*.2);if(teammate)log(m,'🔄 '+label(i,p)+' plays a pass to '+label(i,teammate)+' as **'+teams[i].name+'** build patiently.');}}
  }
  const playPeriod=async(start,end)=>{
    for(let m=start+1;m<=end;m++){
      minute=m;minuteEventsLog=[];minuteEvents(m);
      await publishMinute(m);
    }
  };
  await playPeriod(0,45);
  minute=45;minuteEventsLog=[];log(45,'⏸️ **HALF-TIME!** '+home.name+' '+score[0]+'–'+score[1]+' '+away.name+'.');await publishMinute(45);
  await playPeriod(45,90);
  minute=90;minuteEventsLog=[];log(90,'⏱️ **FULL-TIME!** '+home.name+' '+score[0]+'–'+score[1]+' '+away.name+'.');await appendHistory(90,minuteEventsLog);
  if(score[0]===score[1]){
    minuteEventsLog=[];log(90,'⏳ The match is level. Two 15-minute periods of extra time!');await publishMinute(90);
    await playPeriod(90,105);
    minute=105;minuteEventsLog=[];log(105,'⏸️ **EXTRA-TIME BREAK.**');await publishMinute(105);
    await playPeriod(105,120);
    minute=120;minuteEventsLog=[];log(120,'⏱️ **END OF EXTRA TIME!**');await appendHistory(120,minuteEventsLog);
  }
  if(score[0]===score[1]){
    minute=120;minuteEventsLog=[];log(120,'🎯 Still level! It is time for a penalty shootout.');pens=[0,0];await publishMinute(120);
    const kick=async i=>{
      const t=teams[i],g=keeper(teams[1-i]),p=choose(field(t),x=>x.shooting+x.effective*.2);
      if(!p)return;
      minuteEventsLog=[];log(120,'🎯 **PENALTY SHOOTOUT — '+t.name+'**\n'+label(i,p)+' steps up...');await publishMinute(120);
      minuteEventsLog=[];const goal=Math.random()<Math.max(.56,Math.min(.86,.74+(p.shooting-g.goalkeeping)/500));
      if(goal)pens[i]++;
      log(120,(goal?'⚽ **SCORES!** ':'🧤 **SAVED!** ')+label(i,p)+(goal?' finds the net past '+label(1-i,g)+'.':' is denied by '+label(1-i,g)+'.')+' Shootout: **'+pens[0]+'–'+pens[1]+'**.');
      await publishMinute(120);
    };
    for(let r=0;r<5;r++){for(let i=0;i<2;i++)await kick(i);const left=4-r;if(pens[0]>pens[1]+left||pens[1]>pens[0]+left)break;}
    while(pens[0]===pens[1]){await kick(0);await kick(1);}
  }
  const winner=pens?(pens[0]>pens[1]?0:1):(score[0]===score[1]?null:(score[0]>score[1]?0:1));
  const finishText=winner===null?'🤝 **The friendly ends in a draw!**':'🏆 **'+teams[winner].name+' win the friendly!**';
  await interaction.followUp({embeds:[makeEmbed(finishText).setTitle('🏁 MATCH FINISHED')]});
  return {score,pens,winner};
}
