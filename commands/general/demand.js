const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { logAction } = require('../../utils/logger');
const getGuildMembers = require('../../utils/getGuildMembers');
const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');
const DemandCooldown = require('../../models/demandCooldown');

const FREE_AGENT_ROLE_ID = '1374495332846669956';
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const activeDemands = new Set();

function formatRemaining(ms) {
  const totalHours = Math.ceil(ms / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `**${days}d ${hours}h**` : `**${hours}h**`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('demand')
    .setDescription('Leave your team and become a Free Agent'),

  async execute(interaction, client) {
    const userId = interaction.user.id;

    if (activeDemands.has(userId)) {
      return interaction.reply({
        content: 'Your demand is already being processed. Please wait.',
        flags: MessageFlags.Ephemeral,
      });
    }

    activeDemands.add(userId);

    try {
      const staffEntry = await Staffs.findOne({ userId });

      if (staffEntry) {
        return interaction.reply({
          content: 'You must be removed from your staff position before using /demand.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const cooldown = await DemandCooldown.findOne({
        guildId: interaction.guild.id,
        userId,
      });

      if (cooldown?.lastUsedAt) {
        const remaining = COOLDOWN_MS - (Date.now() - cooldown.lastUsedAt.getTime());

        if (remaining > 0) {
          return interaction.reply({
            content: `You can use /demand again in ${formatRemaining(remaining)}.`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      await getGuildMembers(interaction.guild);
      const member = await interaction.guild.members.fetch(userId);
      const teams = await Teams.find();
      const team = teams.find(entry => member.roles.cache.has(entry.roleId));

      if (!team) {
        return interaction.reply({
          content: 'You are not currently on a team.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (activeDemands.has(`${userId}:roles`)) {
        return interaction.reply({
          content: 'Your demand is already being processed. Please wait.',
          flags: MessageFlags.Ephemeral,
        });
      }

      try {
        await member.roles.remove(
          team.roleId,
          `Player used /demand to leave ${team.name}`
        );

        if (!member.roles.cache.has(FREE_AGENT_ROLE_ID)) {
          await member.roles.add(
            FREE_AGENT_ROLE_ID,
            `Player became a Free Agent through /demand`
          );
        }
      } catch (error) {
        await member.roles.add(team.roleId, 'Rolling back incomplete /demand').catch(() => {});
        throw error;
      }

      await DemandCooldown.findOneAndUpdate(
        { guildId: interaction.guild.id, userId },
        { $set: { lastUsedAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('Player Demanded Release')
        .addFields(
          { name: 'Player', value: `<@${userId}>`, inline: true },
          { name: 'Team', value: `${team.emoji || ''} **${team.name}**`, inline: true },
          { name: 'New Status', value: 'Free Agent', inline: true },
        )
        .setTimestamp();

      await logAction(client, {
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      return interaction.reply({
        content: `You have left **${team.name}** and are now a Free Agent. You can use /demand again in **14 days**.`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('Error in /demand:', error);
      const reply = {
        content: 'Something went wrong processing your demand. Please try again later.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        return interaction.followUp(reply).catch(() => {});
      }

      return interaction.reply(reply).catch(() => {});
    } finally {
      activeDemands.delete(userId);
      activeDemands.delete(`${userId}:roles`);
    }
  },
};
