const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { logModerationAction } = require('../../utils/moderationLogger');
const { getActiveRateLimit, recordRateEvent } = require('../../utils/moderationRateLimiter');

const ALLOWED_ROLE_IDS = ['1561183666976202832', '1374495087509114901'];
const TRIAL_MOD_ROLE_ID = '1374495103049269298';
const LOG_CHANNEL_ID = '1374495867691597976';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hire')
    .setDescription('Hire a member as a Trial Moderator.')
    .addUserOption(option => option.setName('member').setDescription('Member to hire').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for hiring this member').setMinLength(1).setMaxLength(500).setRequired(true))
    .setDefaultMemberPermissions(null),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command can only be used in the league server.', flags: MessageFlags.Ephemeral });
    }
    const moderator = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!moderator || !moderator.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id))) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    if (await getActiveRateLimit(interaction.guild.id, interaction.user.id, 'staff_management')) {
      return interaction.reply({ content: 'You cannot use this command right now.', flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason', true).trim();
    if (!reason) return interaction.reply({ content: 'A reason is required.', flags: MessageFlags.Ephemeral });
    if (targetUser.bot) return interaction.reply({ content: 'Bots cannot be hired as moderators.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) return interaction.editReply({ content: 'That member is not in this server.' });
    if (target.roles.cache.has(TRIAL_MOD_ROLE_ID)) {
      return interaction.editReply({ content: 'That member is already a Trial Moderator.' });
    }

    try {
      const role = await interaction.guild.roles.fetch(TRIAL_MOD_ROLE_ID);
      if (!role) return interaction.editReply({ content: 'The Trial Mod role could not be found.' });
      await target.roles.add(role, `Hired by ${interaction.user.tag}: ${reason}`);
    } catch (error) {
      console.error('Failed to hire moderator:', error);
      return interaction.editReply({ content: 'Could not give that member the Trial Mod role. Check the bot role position and permissions.' });
    }

    await logModerationAction({
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      action: 'Moderator Hire',
      targetId: target.id,
      reason,
      details: 'Granted Trial Mod role.',
      channelId: interaction.channelId,
    });
    try {
      await recordRateEvent({
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        action: 'staff_management',
        type: 'hire',
        targetId: target.id,
        threshold: 2,
      });
    } catch (error) {
      console.error('Failed to update staff action rate limit:', error);
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Moderator Hired')
      .addFields(
        { name: 'Member', value: `<@${target.id}> (${target.user.tag})`, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Role Given', value: 'Trial Mod', inline: true },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();
    try {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel?.isTextBased() && logChannel.send) {
        await logChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      }
    } catch (error) {
      console.error('Failed to send moderator hire log:', error);
    }
    return interaction.editReply({ content: `Successfully hired <@${target.id}> as a Trial Moderator.` });
  },
};
