const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const WarningCase = require('../../models/warningCases');
const ModerationAction = require('../../models/moderationActions');
const ALLOWED_ROLES = ['1561183666976202832', '1374495087509114901', '1374495092521566260'];

async function hasStatsCasesPermission(interaction) {
  if (!interaction.guild) return false;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return Boolean(member && member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id)));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cases')
    .setDescription('View recorded moderation cases across the server.')
    .addUserOption(option => option.setName('member').setDescription('Only show actions involving this member').setRequired(false))
    .addUserOption(option => option.setName('moderator').setDescription('Only show actions by this moderator').setRequired(false))
    .setDefaultMemberPermissions(null),

  async execute(interaction) {
    if (!await hasStatsCasesPermission(interaction)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('member');
    const moderator = interaction.options.getUser('moderator');
    const warningFilter = { guildId: interaction.guild.id };
    const actionFilter = { guildId: interaction.guild.id };
    if (target) {
      warningFilter.userId = target.id;
      actionFilter.targetId = target.id;
    }
    if (moderator) {
      warningFilter.moderatorId = moderator.id;
      actionFilter.moderatorId = moderator.id;
    }

    const [warnings, actions] = await Promise.all([
      WarningCase.find(warningFilter).sort({ createdAt: -1 }).limit(50).lean(),
      ModerationAction.find(actionFilter).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    const entries = [
      ...warnings.map(item => ({ id: item.caseId, action: 'Warning', targetId: item.userId, moderatorId: item.moderatorId, details: `${item.offense} (+${item.pointsAdded} points)`, time: item.createdAt })),
      ...actions.map(item => ({ id: item.caseId, action: item.action, targetId: item.targetId, moderatorId: item.moderatorId, details: item.reason || item.details || 'No details', time: item.createdAt })),
    ].sort((a, b) => new Date(b.time) - new Date(a.time));

    if (!entries.length) return interaction.editReply({ content: 'No moderation cases matched those filters.' });
    const lines = entries.slice(0, 15).map(item =>
      `**#${item.id} • ${item.action}**\n- Member: ${item.targetId ? `<@${item.targetId}>` : 'Not member-specific'}\n- Moderator: <@${item.moderatorId}>\n- Details: ${String(item.details).slice(0, 180)}\n- <t:${Math.floor(new Date(item.time).getTime() / 1000)}:f>`
    );
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('Moderation Cases')
      .setDescription(lines.join('\n\n').slice(0, 4000))
      .setFooter({ text: `Showing ${Math.min(entries.length, 15)} of ${entries.length} matching cases` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
