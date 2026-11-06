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
    .setName('stats')
    .setDescription('View the moderation activity of a moderator.')
    .addUserOption(option => option.setName('moderator').setDescription('Moderator to check (defaults to yourself)').setRequired(false))
    .setDefaultMemberPermissions(null),

  async execute(interaction) {
    if (!await hasStatsCasesPermission(interaction)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const moderator = interaction.options.getUser('moderator') || interaction.user;
    const [warningCount, actionCount, breakdown, latestWarnings, latestActions] = await Promise.all([
      WarningCase.countDocuments({ guildId: interaction.guild.id, moderatorId: moderator.id }),
      ModerationAction.countDocuments({ guildId: interaction.guild.id, moderatorId: moderator.id }),
      ModerationAction.aggregate([
        { $match: { guildId: interaction.guild.id, moderatorId: moderator.id } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      WarningCase.find({ guildId: interaction.guild.id, moderatorId: moderator.id }).sort({ createdAt: -1 }).limit(1).lean(),
      ModerationAction.find({ guildId: interaction.guild.id, moderatorId: moderator.id }).sort({ createdAt: -1 }).limit(1).lean(),
    ]);
    const total = warningCount + actionCount;
    const breakdownText = [
      `Warnings: **${warningCount}**`,
      ...breakdown.map(item => `${item._id}: **${item.count}**`),
    ].join('\n');
    const latest = [
      ...latestWarnings.map(item => ({ id: item.caseId, time: item.createdAt })),
      ...latestActions.map(item => ({ id: item.caseId, time: item.createdAt })),
    ].sort((a, b) => new Date(b.time) - new Date(a.time))[0];

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(`Moderator Stats • ${moderator.tag}`)
      .setThumbnail(moderator.displayAvatarURL())
      .addFields(
        { name: 'Total Recorded Actions', value: String(total), inline: true },
        { name: 'Warnings Issued', value: String(warningCount), inline: true },
        { name: 'Other Actions', value: String(actionCount), inline: true },
        { name: 'Action Breakdown', value: breakdownText.slice(0, 1024) || 'No recorded actions.' },
        { name: 'Most Recent Action', value: latest ? `Case #${latest.id} • <t:${Math.floor(new Date(latest.time).getTime() / 1000)}:R>` : 'No recorded actions.' },
      )
      .setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
