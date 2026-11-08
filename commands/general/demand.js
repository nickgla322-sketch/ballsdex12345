const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');
const DemandCooldown = require('../../models/demandCooldown');
const { logAction } = require('../../utils/logger');

const FREE_AGENT_ROLE_ID = '1374495332846669956';
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

function formatRemaining(ms) {
  const totalHours = Math.ceil(ms / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('demand')
    .setDescription('Leave your current team and become a free agent'),

  async execute(interaction, client) {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    try {
      const previousDemand = await DemandCooldown.findOne({
        guildId,
        userId,
      });

      if (previousDemand) {
        const nextAvailableAt = previousDemand.lastDemandAt.getTime() + COOLDOWN_MS;
        const remaining = nextAvailableAt - Date.now();

        if (remaining > 0) {
          return interaction.reply({
            content: `You can use /demand again in **${formatRemaining(remaining)}**.`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      const member = await interaction.guild.members.fetch(userId);
      const teams = await Teams.find();
      const currentTeam = teams.find(team =>
        member.roles.cache.has(team.roleId)
      );

      if (!currentTeam) {
        return interaction.reply({
          content: 'You are not currently on a team.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // /demand is for players only. Staff must be removed from their position first.
      const staffEntry = await Staffs.findOne({
        userId,
        teamRoleId: currentTeam.roleId,
      });

      if (staffEntry) {
        const positionNames = {
          assistant: 'Assistant Manager',
          manager: 'Manager',
          chairman: 'Chairman',
        };
        return interaction.reply({
          content: `You cannot use /demand while you are a **${positionNames[staffEntry.position] || staffEntry.position}**. You must be removed from your staff position first.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!member.roles.cache.has(FREE_AGENT_ROLE_ID)) {
        await member.roles.add(
          FREE_AGENT_ROLE_ID,
          `Player demanded release from ${currentTeam.name}`
        );
      }

      await member.roles.remove(
        currentTeam.roleId,
        `Player demanded release from ${currentTeam.name}`
      );

      // Save the cooldown only after the role changes have succeeded.
      await DemandCooldown.findOneAndUpdate(
        { guildId, userId },
        { $set: { lastDemandAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('Player Demanded Release')
        .addFields(
          { name: 'Player', value: `<@${userId}>`, inline: false },
          { name: 'Former Team', value: `${currentTeam.emoji || ''} <@&${currentTeam.roleId}>`, inline: false },
          { name: 'New Status', value: 'Free Agent', inline: false },
          { name: 'Next Demand Available', value: '<t:${Math.floor((Date.now() + COOLDOWN_MS) / 1000)}:F>', inline: false }
        )
        .setTimestamp();

      await logAction(client, {
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      return interaction.reply({
        content: `You have left **${currentTeam.name}** and are now a **Free Agent**. You can use /demand again in **2 weeks**.`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('Demand command failed:', error);

      const reply = {
        content: 'Something went wrong processing your demand. Please contact a server administrator.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.deferred || interaction.replied) {
        return interaction.followUp(reply).catch(() => {});
      }

      return interaction.reply(reply).catch(() => {});
    }
  },
};
