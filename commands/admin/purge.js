const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { logModerationAction } = require('../../utils/moderationLogger');

const ALLOWED_ROLE_IDS = [
  '1561183666976202832',
  '1374495103049269298',
  '1374495097961578656',
  '1374495092521566260',
  '1374495087509114901',
];
const LOG_CHANNEL_ID = '1374495867691597976';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete multiple messages from this channel.')
    .addIntegerOption(option => option.setName('amount').setDescription('How many messages to delete (1-100).').setMinValue(1).setMaxValue(100).setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Why these messages are being purged.').setMaxLength(500).setRequired(true))
    .setDefaultMemberPermissions(null),

  async execute(interaction, client) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member || !member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id))) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }

    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason', true).trim();
    const channel = interaction.channel;
    if (!reason) return interaction.reply({ content: 'A reason is required.', flags: MessageFlags.Ephemeral });
    if (!channel || !channel.isTextBased() || !channel.messages) {
      return interaction.reply({ content: 'This command can only be used in a text channel.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const messages = await channel.messages.fetch({ limit: amount });
      const deletedMessages = [];
      const oldMessages = messages.filter(message => Date.now() - message.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);
      const recentMessages = messages.filter(message => Date.now() - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000);

      if (recentMessages.size) {
        const deleted = await channel.bulkDelete(recentMessages, true);
        deletedMessages.push(...deleted.values());
      }
      for (const message of oldMessages.values()) {
        try { await message.delete(); deletedMessages.push(message); }
        catch (error) { console.error(`Failed to delete message ${message.id}:`, error.message); }
      }

      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (!logChannel?.isTextBased() || !logChannel.send) throw new Error('Purge log channel unavailable.');

      const details = deletedMessages.map(message => {
        const author = message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown user';
        const body = message.content?.trim() || '[No text content]';
        const files = [...message.attachments.values()].map(file => file.url);
        return `**${author}** · <t:${Math.floor(message.createdTimestamp / 1000)}:f>\n${body}${files.length ? `\nAttachments: ${files.join('\n')}` : ''}`.slice(0, 850);
      });

      const chunks = [];
      let chunk = '';
      for (const detail of (details.length ? details : ['No message details were available.'])) {
        const candidate = chunk ? `${chunk}\n\n${detail}` : detail;
        if (candidate.length > 3500 && chunk) { chunks.push(chunk); chunk = detail; }
        else chunk = candidate;
      }
      if (chunk) chunks.push(chunk);

      for (let i = 0; i < chunks.length; i++) {
        const embed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('Messages Purged')
          .setDescription(chunks[i])
          .addFields(
            { name: 'Purged by', value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: true },
            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
            { name: 'Deleted', value: `${deletedMessages.length}/${messages.size}`, inline: true },
            { name: 'Reason', value: reason.slice(0, 1024) }
          )
          .setFooter({ text: chunks.length > 1 ? `Log page ${i + 1}/${chunks.length}` : `Purge ID: ${interaction.id}` })
          .setTimestamp();
        await logChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      }

      await logModerationAction({
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        action: 'Purge',
        reason,
        details: `Deleted ${deletedMessages.length} of ${messages.size} messages in <#${channel.id}>`,
        channelId: channel.id,
      });

      return interaction.editReply({ content: `Successfully deleted **${deletedMessages.length}** of **${messages.size}** messages. Logged the action in the audit channel.` });
    } catch (error) {
      console.error('Purge command error:', error);
      return interaction.editReply({ content: 'Purge completed or failed with an error. Check bot permissions and the purge log channel.' });
    }
  },
};
