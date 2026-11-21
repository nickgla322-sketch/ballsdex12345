const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { logModerationAction } = require('../../utils/moderationLogger');
const { getActiveRateLimit, recordRateEvent } = require('../../utils/moderationRateLimiter');

const STAFF_MANAGEMENT_ROLE_IDS = ['1374495075819847680', '1561183666976202832'];
const STAFF_RANKS = [
  { name: 'Trial Moderator', value: 'trial_mod', roleId: '1374495103049269298' },
  { name: 'Moderator', value: 'mod', roleId: '1374495097961578656' },
  { name: 'Senior Moderator', value: 'senior_mod', roleId: '1374495092521566260' },
  { name: 'Mod Overseer', value: 'mod_overseer', roleId: '1374495087509114901' },
  { name: 'Trial Media', value: 'trial_media', roleId: '1374495118794555433' },
  { name: 'Media', value: 'media', roleId: '1374495113396486234' },
  { name: 'Media Overseer', value: 'media_overseer', roleId: '1374495108224909455' },
  { name: 'Stats Committee', value: 'stats_committee', roleId: '1374495123647369279' },
];
const LOG_CHANNEL_ID = '1374495742151884810';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hire')
    .setDescription('Hire a member into a staff role.')
    .addUserOption(option => option.setName('member').setDescription('Member to hire').setRequired(true))
    .addStringOption(option => option.setName('rank').setDescription('Staff rank to assign').setRequired(true).addChoices(
      ...STAFF_RANKS.map(rank => ({ name: rank.name, value: rank.value })),
    ))
    .addStringOption(option => option.setName('reason').setDescription('Reason for hiring this member').setMinLength(1).setMaxLength(500).setRequired(true))
    .setDefaultMemberPermissions(null),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command can only be used in the league server.', flags: MessageFlags.Ephemeral });
    }
    if (interaction.user.id === '1567727410324054048') {
      return interaction.reply({ content: 'You are not allowed to hire staff.', flags: MessageFlags.Ephemeral });
    }
    const moderator = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!moderator || !moderator.roles.cache.some(role => STAFF_MANAGEMENT_ROLE_IDS.includes(role.id))) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }
    if (await getActiveRateLimit(interaction.guild.id, interaction.user.id, 'staff_management')) {
      return interaction.reply({ content: 'You cannot use this command right now.', flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('member', true);
    const rank = STAFF_RANKS.find(item => item.value === interaction.options.getString('rank', true));
    const reason = interaction.options.getString('reason', true).trim();
    if (!rank) return interaction.reply({ content: 'That staff rank is not valid.', flags: MessageFlags.Ephemeral });
    if (!reason) return interaction.reply({ content: 'A reason is required.', flags: MessageFlags.Ephemeral });
    if (targetUser.bot) return interaction.reply({ content: 'Bots cannot be hired into staff roles.', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) return interaction.editReply({ content: 'That member is not in this server.' });
    const existingStaffRole = STAFF_RANKS.find(item => target.roles.cache.has(item.roleId));
    if (existingStaffRole) {
      return interaction.editReply({ content: 'That member already has a staff role.' });
    }

    try {
      const role = await interaction.guild.roles.fetch(rank.roleId);
      if (!role) return interaction.editReply({ content: `The ${rank.name} role could not be found.` });
      await target.roles.add(role, `Hired by ${interaction.user.tag}: ${reason}`);
    } catch (error) {
      console.error('Failed to hire staff member:', error);
      return interaction.editReply({ content: 'Could not assign that staff role. Check the bot role position and permissions.' });
    }

    await logModerationAction({
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id,
      action: 'Staff Hire',
      targetId: target.id,
      reason,
      details: `Granted ${rank.name} role (${rank.roleId}).`,
      channelId: interaction.channelId,
    });
    try {
      await recordRateEvent({
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id,
        action: 'staff_management',
        type: 'hire',
        targetId: target.id,
      });
    } catch (error) {
      console.error('Failed to update staff action rate limit:', error);
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Staff Member Hired')
      .addFields(
        { name: 'Member', value: `<@${target.id}> (${target.user.tag})`, inline: true },
        { name: 'Hired By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Role Given', value: rank.name, inline: true },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();
    try {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (logChannel?.isTextBased() && logChannel.send) {
        await logChannel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      }
    } catch (error) {
      console.error('Failed to send staff hire log:', error);
    }
    return interaction.editReply({ content: `Successfully hired <@${target.id}> as ${rank.name}.` });
  },
};
