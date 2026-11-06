const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const WarningCase = require('../../models/warningCases');

const ALLOWED_ROLE_IDS = [
  '1561183666976202832',
  '1374495087509114901',
  '1374495092521566260',
  '1374495097961578656',
  '1374495103049269298',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('viewwarn')
    .setDescription('View the details of a warning case.')
    .addIntegerOption(option =>
      option.setName('case_id')
        .setDescription('The warning case ID')
        .setMinValue(100000)
        .setMaxValue(999999)
        .setRequired(true)),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member || !member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id))) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const caseId = interaction.options.getInteger('case_id', true);
    const record = await WarningCase.findOne({ guildId: interaction.guild.id, caseId });
    if (!record) {
      return interaction.editReply({ content: `No warning case found with ID **${caseId}**.` });
    }

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(`Warning Case #${record.caseId}`)
      .addFields(
        { name: 'Warned Member', value: `<@${record.userId}>`, inline: true },
        { name: 'Moderator', value: `<@${record.moderatorId}>`, inline: true },
        { name: 'Reason', value: record.offense, inline: true },
        { name: 'Points Added', value: String(record.pointsAdded), inline: true },
        { name: 'Total Points After Warning', value: String(record.totalPointsAfter), inline: true },
        { name: 'Moderator Message', value: record.moderatorMessage },
        { name: 'Proof', value: record.proofUrl ? `[Open proof attachment](${record.proofUrl})` : 'No proof was attached.' },
      )
      .setTimestamp(record.createdAt);

    if (record.proofUrl && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(record.proofUrl)) {
      embed.setImage(record.proofUrl);
    }

    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
