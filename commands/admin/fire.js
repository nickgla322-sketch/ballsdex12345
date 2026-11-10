const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { logModerationAction } = require('../../utils/moderationLogger');
const { getActiveRateLimit, recordRateEvent } = require('../../utils/moderationRateLimiter');

const SENIOR_MOD_ROLE_ID = '1374495092521566260';
const SENIOR_AND_ABOVE_ROLE_IDS = ['1561183666976202832', '1374495087509114901'];
const TRIAL_AND_MOD_ROLE_IDS = [
  '1374495103049269298',
  '1374495097961578656',
];
const ALL_MODERATION_ROLE_IDS = [
  ...TRIAL_AND_MOD_ROLE_IDS,
  SENIOR_MOD_ROLE_ID,
];
const LOG_CHANNEL_ID = '1374495742151884810';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fire')
    .setDescription('Remove a member from the moderation team.')
    .addUserOption(option => option.setName('member').setDescription('Member to remove from staff').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for firing this member').setMinLength(1).setMaxLength(500).setRequired(true))
    .setDefaultMemberPermissions(null),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command can only be used in the league server.', flags: MessageFlags.Ephemeral });
    }
    const moderator = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!moderator || !moderator.roles.cache.some(role => [...SENIOR_AND_ABOVE_ROLE_IDS, SENIOR_MOD_ROLE_ID].includes(role.id))) {
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
    const canFireSeniorMods = moderator.roles.cache.some(role => SENIOR_AND_ABOVE_ROLE_IDS.includes(role.id));
    const permittedRoleIds = canFireSeniorMods ? ALL_MODERATION_ROLE_IDS : TRIAL_AND_MOD_ROLE_IDS;
    const rolesToRemove = permittedRoleIds.filter(roleId => target.roles.cache.has(roleId));
    if (!rolesToRemove.length) {
      return interaction.editReply({ content: 'That member does not have any moderation roles you are allowed to remove.' });
    }

    try {
      await target.roles.remove(rolesToRemove, `Removed from moderation team by ${interaction.user.tag}: ${reason}`);
    } catch (error) {
      console.error('Failed to fire moderator:', error);
      return interaction.editReply({ content: 'Could not remove the moderation roles. Check the bot role position and permissions.' });
    }

    await logModerationAction({
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      action: 'Moderator Fire',
      targetId: target.id,
      reason,
      details: `Removed moderation roles: ${rolesToRemove.join(', ')}`,
      channelId: interaction.channelId,
    });
    try {
      await recordRateEvent({
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        action: 'staff_management',
        type: 'fire',
        targetId: target.id,
        threshold: 2,
      });
    } catch (error) {
      console.error('Failed to update staff action rate limit:', error);
    }

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('Moderator Fired')
      .addFields(
        { name: 'Member', value: `<@${target.id}> (${target.user.tag})`, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Roles Removed', value: rolesToRemove.map(id => `<@&${id}>`).join('\n') },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();
    try {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel?.isTextBased() && logChannel.send) {
        await logChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      }
    } catch (error) {
      console.error('Failed to send moderator fire log:', error);
    }
    return interaction.editReply({ content: `Successfully removed ${rolesToRemove.map(id => `<@&${id}>`).join(', ')} from <@${target.id}>.`, allowedMentions: { parse: [] } });
  },
};
