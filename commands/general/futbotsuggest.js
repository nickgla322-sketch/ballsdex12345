const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('futbotsuggest').setDescription('Send a suggestion to the FutBot team')
    .addStringOption(o=>o.setName('suggestion').setDescription('Your idea or feedback').setRequired(true).setMaxLength(1500)),
  async execute(interaction, client) {
    await interaction.deferReply({ephemeral:true});
    try {
      const channelId=process.env.FUTBOT_SUGGESTION_CHANNEL_ID;
      if(!channelId) throw new Error('FUTBOT_SUGGESTION_CHANNEL_ID is not configured on the Node.js service.');
      const channel=await client.channels.fetch(channelId);
      if(!channel || !channel.isTextBased() || !channel.send) throw new Error('The configured suggestion channel could not be found or is not a text channel.');
      const embed=new EmbedBuilder().setColor(0x3498db).setTitle('New FutBot Suggestion')
        .setDescription(interaction.options.getString('suggestion'))
        .addFields({name:'Suggested by',value:interaction.user.toString()})
        .setTimestamp();
      await channel.send({embeds:[embed]});
      return interaction.editReply({content:'Thank you! Your suggestion has been forwarded to the FutBot team.'});
    } catch(error) {
      console.error('[FutBot suggestion]',error);
      return interaction.editReply({content:'Could not send your suggestion: '+String(error.message || 'Unknown error').slice(0,1500)});
    }
  },
};
