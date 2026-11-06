const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const Warnings = require('../../models/warnings');
const { logModerationAction } = require('../../utils/moderationLogger');

const EDIT_ROLE_ID = '1374495054231638107';
const LOG_CHANNEL_ID = '1374495867691597976';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('editpoints')
    .setDescription('Set a member’s warning point total.')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('Member whose points you want to edit')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('points')
        .setDescription('New total warning points')
        .setMinValue(0)
        .setMaxValue(100000)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for changing the points')
        .setMinLength(1)
        .setMaxLength(500)
        .setRequired(true)),

  async execute(interaction, client) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.roles.cache.has(EDIT_ROLE_ID)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getUser('member', true);
    const newPoints = interaction.options.getInteger('points', true);
    const reason = interaction.options.getString('reason', true).trim();

    const record = await Warnings.findOneAndUpdate(
      { guildId: interaction.guild.id, userId: target.id },
      {
        $set: { points: newPoints },
        $setOnInsert: { guildId: interaction.guild.id, userId: target.id, warningCount: 0 },
      },
      { upsert: true, new: false, setDefaultsOnInsert: true },
    );
    const oldPoints = record?.points || 0;

    await logModerationAction({
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      action: 'Edit Warning Points',
      targetId: target.id,
      reason,
      details: `Changed warning points from ${oldPoints} to ${newPoints}`,
    });

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('Warning Points Edited')
      .addFields(
        { name: 'Member', value: `<@${target.id}>`, inline: true },
        { name: 'Previous Points', value: String(oldPoints), inline: true },
        { name: 'New Points', value: String(newPoints), inline: true },
        { name: 'Edited By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();

    try {
      const channel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (channel?.isTextBased() && channel.send) {
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      }
    } catch (error) {
      console.error('Failed to log warning point edit:', error);
    }

    return interaction.editReply(`Updated <@${target.id}> from **${oldPoints}** to **${newPoints}** warning points.`);
  },
};
