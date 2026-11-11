const { SlashCommandBuilder, MessageFlags, PermissionsBitField } = require('discord.js');
const ModerationRateLimit = require('../../models/moderationRateLimits');
const { logModerationAction } = require('../../utils/moderationLogger');
const { hasModPermission } = require('../../utils/modPermissions');

const WINDOW_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_USES = 3;

// Serialize checks for the same moderator within this bot process.
const moderatorLocks = new Map();

async function withModeratorLock(key, callback) {
  const previous = moderatorLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  moderatorLocks.set(key, current);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (moderatorLocks.get(key) === current) moderatorLocks.delete(key);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a member timeout.')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('The member whose timeout should be removed.')
        .setRequired(true))
    .setDefaultMemberPermissions(null),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
    }

    if (!await hasModPermission(interaction)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    }

    const targetUser = interaction.options.getUser('member', true);
    if (targetUser.bot) {
      return interaction.reply({ content: 'You cannot remove a timeout from a bot.', flags: MessageFlags.Ephemeral });
    }

    const moderatorId = interaction.user.id;
    const guildId = interaction.guild.id;
    const rateKey = { guildId, moderatorId, action: 'untimeout' };

    return withModeratorLock(`${guildId}:${moderatorId}`, async () => {
      const now = new Date();
      let rateRecord;
      try {
        await ModerationRateLimit.updateOne(rateKey, { $setOnInsert: rateKey }, { upsert: true });
        rateRecord = await ModerationRateLimit.findOne(rateKey);
        if (rateRecord?.blockedUntil && rateRecord.blockedUntil.getTime() > now.getTime()) {
          return interaction.reply({ content: 'You cannot use this command right now.', flags: MessageFlags.Ephemeral });
        }

        const cutoff = new Date(now.getTime() - WINDOW_MS);
        const recentEvents = (rateRecord?.events || []).filter(event =>
          event.type === 'untimeout' && event.createdAt.getTime() >= cutoff.getTime()
        );
        if (recentEvents.length >= MAX_USES) {
          await ModerationRateLimit.updateOne(rateKey, {
            $set: { blockedUntil: new Date(now.getTime() + COOLDOWN_MS) },
            $pull: { events: { createdAt: { $lt: cutoff } } },
          });
          return interaction.reply({ content: 'You cannot use this command right now.', flags: MessageFlags.Ephemeral });
        }
      } catch (error) {
        console.error('Failed to check untimeout rate limit:', error);
        return interaction.reply({ content: 'Could not verify command availability. Please try again.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let target;
      try {
        target = await interaction.guild.members.fetch(targetUser.id);
      } catch {
        return interaction.editReply({ content: 'That member is not in this server.' });
      }

      if (!target.communicationDisabledUntilTimestamp || target.communicationDisabledUntilTimestamp <= Date.now()) {
        return interaction.editReply({ content: 'That member is not currently timed out.' });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember || !interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.editReply({ content: 'I need the Moderate Members permission to remove timeouts.' });
      }
      if (target.id === interaction.guild.ownerId || target.roles.highest.position >= botMember.roles.highest.position) {
        return interaction.editReply({ content: 'I cannot remove this member’s timeout because their role is at or above my highest role.' });
      }

      try {
        await target.timeout(null, `Timeout removed by ${interaction.user.tag}`);
      } catch (error) {
        console.error('Untimeout command error:', error);
        return interaction.editReply({ content: 'I could not remove that timeout. Check my role position and permissions.' });
      }

      try {
        await ModerationRateLimit.updateOne(rateKey, {
          $pull: { events: { createdAt: { $lt: new Date(Date.now() - WINDOW_MS) } } },
          $push: {
            events: {
              $each: [{ type: 'untimeout', targetId: target.id, createdAt: new Date() }],
              $slice: -50,
            },
          },
        });
      } catch (error) {
        console.error('Failed to save untimeout rate event:', error);
      }

      await logModerationAction({
        guildId,
        moderatorId,
        action: 'Untimeout',
        reason: 'Member timeout removed',
        details: `Timeout removed from <@${target.id}> (${target.user.tag})`,
        targetId: target.id,
        targetTag: target.user.tag,
      });

      return interaction.editReply({ content: `Removed the timeout from <@${target.id}>.` });
    });
  },
};
