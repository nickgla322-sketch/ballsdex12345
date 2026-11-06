const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const Warnings = require('../../models/warnings');

const ALLOWED_ROLE_IDS = [
  '1561183666976202832',
  '1374495087509114901',
  '1374495092521566260',
  '1374495097961578656',
  '1374495103049269298',
];
const LOG_CHANNEL_ID = '1374495867691597976';
const SUPPORT_INVITE = 'https://discord.gg/CMpHwxNpF';
const BAN_THRESHOLD = 100;
const TIMEOUT_MINUTES_PER_POINT = 2;

const OFFENSES = {
  nsfw: { label: 'NSFW', points: 20 },
  major_nsfw: { label: 'Major NSFW', points: 40 },
  racism: { label: 'Racism', points: 25 },
  major_racism: { label: 'Major Racism', points: 45 },
  spamming_messages: { label: 'Spamming (messages)', points: 5 },
  spamming_pings: { label: 'Spamming (pings)', points: 10 },
  advertising: { label: 'Advertising', points: 10 },
  harassment: { label: 'Harassment', points: 10 },
  raiding: { label: 'Raiding', points: 45 },
  disrespect_staff: { label: 'Disrespect to Staff', points: 10 },
  impersonation: { label: 'Impersonation', points: 10 },
  doxxing: { label: 'Doxxing / Revealing Personal Info', points: 45 },
  scamming: { label: 'Scamming', points: 25 },
};

const OFFENSE_LIST = Object.values(OFFENSES)
  .map(offense => `- ${offense.label} - ${offense.points} points`)
  .join('\n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning and apply the appropriate punishment.')
    .addUserOption(option =>
      option.setName('member')
        .setDescription('Member receiving the warning')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Select the offense')
        .setRequired(true)
        .addChoices(
          { name: 'NSFW - 20 points', value: 'nsfw' },
          { name: 'Major NSFW - 40 points', value: 'major_nsfw' },
          { name: 'Racism - 25 points', value: 'racism' },
          { name: 'Major Racism - 45 points', value: 'major_racism' },
          { name: 'Spamming (messages) - 5 points', value: 'spamming_messages' },
          { name: 'Spamming (pings) - 10 points', value: 'spamming_pings' },
          { name: 'Advertising - 10 points', value: 'advertising' },
          { name: 'Harassment - 10 points', value: 'harassment' },
          { name: 'Raiding - 45 points', value: 'raiding' },
          { name: 'Disrespect to Staff - 10 points', value: 'disrespect_staff' },
          { name: 'Impersonation - 10 points', value: 'impersonation' },
          { name: 'Doxxing / Revealing Personal Info - 45 points', value: 'doxxing' },
          { name: 'Scamming - 25 points', value: 'scamming' },
        ))
    .addAttachmentOption(option =>
      option.setName('proof')
        .setDescription('Optional proof attachment for this warning')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('moderator_message')
        .setDescription('Required message to include in the warning DM')
        .setMinLength(1)
        .setMaxLength(500)
        .setRequired(true))
    .setDefaultMemberPermissions(null),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'This command can only be used in the league server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const moderator = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!moderator || !moderator.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id))) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetUser = interaction.options.getUser('member', true);
    const offense = OFFENSES[interaction.options.getString('reason', true)];
    const proof = interaction.options.getAttachment('proof');
    const moderatorMessage = interaction.options.getString('moderator_message', true).trim();
    if (!moderatorMessage) {
      return interaction.reply({ content: 'A moderator message is required.', flags: MessageFlags.Ephemeral });
    }
    if (!offense) {
      return interaction.reply({ content: 'That warning reason is not valid.', flags: MessageFlags.Ephemeral });
    }
    if (targetUser.id === interaction.user.id || targetUser.bot) {
      return interaction.reply({
        content: 'You cannot warn yourself or a bot.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let target;
    try {
      target = await interaction.guild.members.fetch(targetUser.id);
    } catch {
      return interaction.editReply({ content: 'That member is not in this server.' });
    }
    if (target.id === interaction.guild.ownerId) {
      return interaction.editReply({ content: 'The server owner cannot be warned by this command.' });
    }

    let previousRecord;
    try {
      previousRecord = await Warnings.findOneAndUpdate(
        { guildId: interaction.guild.id, userId: target.id },
        {
          $inc: { points: offense.points, warningCount: 1 },
          $setOnInsert: { guildId: interaction.guild.id, userId: target.id },
        },
        { upsert: true, new: false, setDefaultsOnInsert: true },
      );
    } catch (error) {
      console.error('Failed to save warning points:', error);
      return interaction.editReply({ content: 'Could not save this warning. No punishment was applied.' });
    }

    const previousPoints = previousRecord?.points || 0;
    const totalPoints = previousPoints + offense.points;
    const reachesBanThreshold = totalPoints >= BAN_THRESHOLD;
    const timeoutMinutes = offense.points * TIMEOUT_MINUTES_PER_POINT;
    let punishment = 'No automatic punishment was applied.';
    let punishmentError = null;

    if (reachesBanThreshold) {
      try {
        await interaction.guild.members.ban(target.id, {
          reason: `Automatic league ban: reached ${totalPoints} warning points. Latest offense: ${offense.label}. Moderator: ${interaction.user.tag}`,
        });
        punishment = `Permanently banned at ${BAN_THRESHOLD} points.`;
      } catch (error) {
        punishmentError = error;
        console.error('Automatic warning ban failed:', error);
        punishment = 'AUTOMATIC BAN FAILED - staff action is required.';
      }
    } else {
      try {
        await target.timeout(
          timeoutMinutes * 60 * 1000,
          `Warning: ${offense.label} (+${offense.points} points) by ${interaction.user.tag}`,
        );
        punishment = `Timed out for ${timeoutMinutes} minutes.`;
      } catch (error) {
        punishmentError = error;
        console.error('Warning timeout failed:', error);
        punishment = `TIMEOUT FAILED - intended duration: ${timeoutMinutes} minutes.`;
      }
    }

    const pointsUntilBan = Math.max(0, BAN_THRESHOLD - totalPoints);
    const status = reachesBanThreshold && !punishmentError ? 'Permanently banned' : 'Under Watch';
    const proofLine = proof ? `[View proof attachment](${proof.url})` : 'No proof attachment provided.';
    const banNotice = reachesBanThreshold
      ? (punishmentError
        ? 'The automatic permanent ban could not be completed. Please contact league staff.'
        : `You have been permanently banned from the league for reaching ${BAN_THRESHOLD} warning points.`)
      : `${pointsUntilBan} more points until the automatic permanent ban.`;

    const serverIcon = interaction.guild.iconURL({ extension: 'png', size: 256 });
    const dmEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setAuthor({
        name: interaction.guild.name,
        ...(serverIcon ? { iconURL: serverIcon } : {}),
      })
      .setTitle('⚠️ You have received a Warning in GFC ⚠️')
      .addFields(
        { name: '**Offense**', value: offense.label, inline: true },
        { name: '**Points Added**', value: String(offense.points), inline: true },
        { name: '**Your Total Points**', value: String(totalPoints), inline: true },
        { name: 'Status', value: status === 'Under Watch' ? '⬛ Under Watch' : '🔴 Permanently Banned' },
        { name: '\u200B', value: '\u200B' },
        {
          name: '**What this means**',
          value: reachesBanThreshold
            ? banNotice
            : `- ${pointsUntilBan} more points until you are permanently banned.\n- You have received a ${timeoutMinutes}-minute timeout.`,
        },
        { name: '\u200B', value: '\u200B' },
        { name: '**Offense List and Point Values**', value: OFFENSE_LIST },
        { name: 'Proof', value: proofLine },
        { name: 'Moderator Message', value: moderatorMessage },
        {
          name: reachesBanThreshold ? '🚫 Auto-Ban Notice' : '⏱️ Punishment Notice',
          value: reachesBanThreshold
            ? (punishmentError
              ? 'The automatic permanent ban could not be completed. Please contact league staff.'
              : `You have been automatically banned from the server for reaching ${BAN_THRESHOLD} points. This is a permanent ban and you may not rejoin.`)
            : `You have been timed out for ${timeoutMinutes} minutes.\n\nYou are currently under watch. Further offenses may lead to a permanent ban.`,
        },
        { name: '\u200B', value: '\u200B' },
        { name: '📩 Appeal', value: `If you believe this was a mistake, you may appeal here: ${SUPPORT_INVITE}` },
      )
      .setFooter({ text: `GFC • ${interaction.guild.name}` })
      .setTimestamp();

    if (serverIcon) dmEmbed.setThumbnail(serverIcon);

    if (proof && proof.contentType?.startsWith('image/')) {
      dmEmbed.setImage(proof.url);
    }

    let dmSent = true;
    try {
      await targetUser.send({ embeds: [dmEmbed] });
    } catch {
      dmSent = false;
    }

    const logEmbed = new EmbedBuilder()
      .setColor(reachesBanThreshold ? 0xed4245 : 0xf1c40f)
      .setAuthor({
        name: interaction.guild.name,
        ...(serverIcon ? { iconURL: serverIcon } : {}),
      })
      .setTitle('⚠️ Member Warned')
      .addFields(
        { name: 'Member', value: `<@${target.id}> (${target.user.tag})`, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: 'Offense', value: offense.label, inline: true },
        { name: 'Previous Points', value: String(previousPoints), inline: true },
        { name: 'Points Added', value: String(offense.points), inline: true },
        { name: 'New Total', value: String(totalPoints), inline: true },
        { name: 'Timeout Duration', value: reachesBanThreshold ? 'Permanent ban threshold reached' : `${timeoutMinutes} minutes`, inline: true },
        { name: 'Punishment Result', value: punishment },
        { name: 'Moderator Message', value: moderatorMessage },
        { name: 'DM Delivered', value: dmSent ? 'Yes' : 'No (DMs may be closed)' },
        { name: 'Proof', value: proof ? `[Open proof attachment](${proof.url})` : 'No proof attachment provided.' },
      )
      .setTimestamp();

    if (serverIcon) logEmbed.setThumbnail(serverIcon);

    if (proof && proof.contentType?.startsWith('image/')) {
      logEmbed.setImage(proof.url);
    }

    try {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
      if (!logChannel?.isTextBased() || !logChannel.send) {
        throw new Error('Warning log channel unavailable.');
      }
      await logChannel.send({ embeds: [logEmbed], allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('Failed to send warning log:', error);
    }

    let response = `Warned <@${target.id}> for **${offense.label}** (+${offense.points} points). Their total is now **${totalPoints}**.\n${punishment}`;
    if (!dmSent) response += '\nTheir DM could not be delivered.';
    if (punishmentError) response += '\nThe punishment failed; please check the bot permissions and take action manually.';
    return interaction.editReply({ content: response });
  },
};
