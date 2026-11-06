const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const Warnings = require('../../models/warnings');

const ALLOWED_ROLE_IDS = [
  '1561183666976202832',
  '1374495087509114901',
  '1374495092521566260',
  '1374495097961578656',
  '1374495103049269298',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('viewpoints')
    .setDescription('View a member’s warning points.')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('Member whose points you want to view')
        .setRequired(true)),

  async execute(interaction) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member || !member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id))) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getUser('member', true);
    const record = await Warnings.findOne({ guildId: interaction.guild.id, userId: target.id });
    const points = record?.points || 0;
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('Warning Points')
      .addFields(
        { name: 'Member', value: `<@${target.id}>`, inline: true },
        { name: 'Total Points', value: String(points), inline: true },
        { name: 'Warnings', value: String(record?.warningCount || 0), inline: true },
      )
      .setTimestamp();
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
