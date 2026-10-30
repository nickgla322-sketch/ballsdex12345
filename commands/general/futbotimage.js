const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');

async function fetchApiImage(path, method = 'GET', body = null) {
  const base = (process.env.FUTBOT_API_URL || '').replace(/\/+$/, '');
  const key = process.env.FUTBOT_API_KEY || '';
  if (!base || !key) throw new Error('FUTBOT_API_URL or FUTBOT_API_KEY is not configured.');
  const response = await fetch(base + path, {
    method,
    headers: {
      'X-API-Key': key,
      ...(body ? {'Content-Type':'application/json'} : {}),
    },
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try { message = JSON.parse(text).error || text; } catch {}
    throw new Error(message || ('Image API returned HTTP ' + response.status));
  }
  return Buffer.from(await response.arrayBuffer());
}

module.exports = {
  data: new SlashCommandBuilder().setName('futbotimage').setDescription('View card artwork and minted card editions')
    .addSubcommand(s => s.setName('card').setDescription('View a card image').addIntegerOption(o => o.setName('card-id').setDescription('Card ID').setRequired(true)))
    .addSubcommand(s => s.setName('minted').setDescription('Generate your personalized card edition image').addIntegerOption(o => o.setName('card-id').setDescription('Card ID').setRequired(true)).addIntegerOption(o => o.setName('edition').setDescription('Edition number you own').setRequired(true).setMinValue(1))),
  async execute(interaction) {
    await interaction.deferReply({ephemeral:true});
    try {
      const sub=interaction.options.getSubcommand();
      const cardId=interaction.options.getInteger('card-id');
      let buffer, filename;
      if(sub==='card') {
        buffer=await fetchApiImage('/api/v1/cards/'+cardId+'/image');
        filename='futbot-card-'+cardId+'.png';
      } else {
        const avatarUrl=interaction.user.displayAvatarURL({extension:'png',size:256});
        let avatar_base64=null;
        try {
          const avatarResponse=await fetch(avatarUrl);
          if(avatarResponse.ok) avatar_base64=Buffer.from(await avatarResponse.arrayBuffer()).toString('base64');
        } catch {}
        buffer=await fetchApiImage('/api/v1/players/'+interaction.user.id+'/cards/'+cardId+'/minted','POST',{
          edition:interaction.options.getInteger('edition'),
          username:interaction.user.username,
          avatar_base64,
        });
        filename='futbot-minted-'+cardId+'-'+interaction.options.getInteger('edition')+'.png';
      }
      const attachment=new AttachmentBuilder(buffer,{name:filename});
      return interaction.editReply({content:'FutBot card image',files:[attachment]});
    } catch(error) {
      console.error('[FutBot image]',error);
      return interaction.editReply({content:'**FutBot image error**\n'+String(error.message || 'Unable to load image').slice(0,1700)});
    }
  },
};
