const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { logModerationAction } = require('../../utils/moderationLogger');
const { getActiveRateLimit, recordRateEvent } = require('../../utils/moderationRateLimiter');

const FULL_STAFF_MANAGEMENT_ROLE_IDS = ['1374495075819847680', '1561183666976202832'];
const MOD_OVERSEER_ROLE_ID = '1374495087509114901';
const FIREABLE_STAFF_ROLES = [
  { name: 'Trial Moderator', roleId: '1374495103049269298' },
  { name: 'Moderator', roleId: '1374495097961578656' },
  { name: 'Senior Moderator', roleId: '1374495092521566260' },
  { name: 'Mod Overseer', roleId: '1374495087509114901' },
  { name: 'Trial Media', roleId: '1374495118794555433' },
  { name: 'Media', roleId: '1374495113396486234' },
  { name: 'Media Overseer', roleId: '1374495108224909455' },
  { name: 'Stats Committee', roleId: '1374495123647369279' },
];
const MODERATION_RANK_ROLE_IDS = [
  '1374495103049269298',
  '1374495097961578656',
  '1374495092521566260',
];
const LOG_CHANNEL_ID = '1374495742151884810';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fire')
    .setDescription('Remove a member from a staff role.')
    .addUserOption(option => option.setName('member').setDescription('Member to remove from staff').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for removing this member').setMinLength(1).setMaxLength(500).setRequired(true))
    .setDefaultMemberPermissions(null),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command can only be used in the league server.', flags: MessageFlags.Ephemeral });
    }
    const moderator = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!moderator) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    const hasFullAccess = moderator.roles.cache.some(role => FULL_STAFF_MANAGEMENT_ROLE_IDS.includes(role.id));
    const hasModOverseerAccess = moderator.roles.cache.has(MOD_OVERSEER_ROLE_ID);
    if (!hasFullAccess && !hasModOverseerAccess) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    if (await getActiveRateLimit(interaction.guild.id, interaction.user.id, 'staff_management')) {
      return interaction.reply({ content: 'You cannot use this command right now.', flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('member', true);
    const reason = interaction.options.getString('reason', true).trim();
    if (!reason) return interaction.reply({ content: 'A reason is required.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) return interaction.editReply({ content: 'That member is not in this server.' });
    const rolesToRemove = FIREABLE_STAFF_ROLES.filter(item =>
      target.roles.cache.has(item.roleId) &&
      (hasFullAccess || MODERATION_RANK_ROLE_IDS.includes(item.roleId))
    );
    if (!rolesToRemove.length) {
      return interaction.editReply({ content: 'That member does not have any staff roles you are allowed to remove.' });
    }

    try {
      await target.roles.remove(rolesToRemove.map(item => item.roleId), `Removed from staff by ${interaction.user.tag}: ${reason}`);
    } catch (error) {
      console.error('Failed to remove staff roles:', error);
      return interaction.editReply({ content: 'Could not remove the staff roles. Check the bot role position and permissions.' });
    }

    await logModerationAction({
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      action: 'Staff Fire',
      targetId: target.id,
      reason,
      details: `Removed staff roles: ${rolesToRemove.map(item => `${item.name} (${item.roleId})`).join(', ')}`,
      channelId: interaction.channelId,
    });
    try {
      await recordRateEvent({
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        action: 'staff_management',
        type: 'fire',
        targetId: target.id,
      });
    } catch (error) {
      console.error('Failed to update staff action rate limit:', error);
    }

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('Staff Member Removed')
      .addFields(
        { name: 'Member', value: `<@${target.id}> (${target.user.tag})`, inline: true },
        { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Roles Removed', value: rolesToRemove.map(item => `<@&${item.roleId}> (${item.name})`).join('\\n') },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();
    try {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel?.isTextBased() && logChannel.send) {
        await logChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      }
    } catch (error) {
      console.error('Failed to send staff fire log:', error);
    }
    return interaction.editReply({
      content: `Successfully removed ${rolesToRemove.map(item => item.name).join(', ')} from <@${target.id}>.`,
      allowedMentions: { parse: [] },
    });
  },
};
