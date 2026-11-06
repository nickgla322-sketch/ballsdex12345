const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const WarningCase = require('../../models/warningCases');
const ModerationAction = require('../../models/moderationActions');
const { hasModPermission } = require('../../utils/modPermissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View all recorded punishments and moderation actions for a member.')
    .addUserOption(option => option.setName('member').setDescription('Member whose history you want to view').setRequired(true))
    .setDefaultMemberPermissions(null),

  async execute(interaction) {
    if (!await hasModPermission(interaction)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('member', true);
    const [warnings, actions] = await Promise.all([
      WarningCase.find({ guildId: interaction.guild.id, userId: target.id }).sort({ createdAt: -1 }).limit(50).lean(),
      ModerationAction.find({ guildId: interaction.guild.id, targetId: target.id }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    const entries = [
      ...warnings.map(item => ({ ...item, kind: 'Warning', label: item.offense, moderator: item.moderatorId, time: item.createdAt, id: item.caseId, extra: `+${item.pointsAdded} points • total ${item.totalPointsAfter}` })),
      ...actions.map(item => ({ ...item, kind: item.action, label: item.reason || item.details || 'No additional details', moderator: item.moderatorId, time: item.createdAt, id: item.caseId, extra: item.details || '' })),
    ].sort((a, b) => new Date(b.time) - new Date(a.time));

    if (!entries.length) return interaction.editReply({ content: `No recorded moderation history found for <@${target.id}>.` });

    const lines = entries.slice(0, 15).map(item =>
      `**Case #${item.id} • ${item.kind}**\n- Moderator: <@${item.moderator}>\n- Details: ${String(item.label).slice(0, 220)}\n- ${item.extra ? `${item.extra} • ` : ''}<t:${Math.floor(new Date(item.time).getTime() / 1000)}:f>`
    );
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(`Moderation History • ${target.tag}`)
      .setDescription(lines.join('\n\n').slice(0, 4000))
      .setFooter({ text: `Showing ${Math.min(entries.length, 15)} of ${entries.length} recorded actions` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
