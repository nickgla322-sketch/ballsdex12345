
const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { DIVISION_ROLE } = require('../../utils/permissions');
const getGuildMembers = require('../../utils/getGuildMembers');

const Divisions = require('../../models/divisions');
const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeName(str) {
  return str
    .normalize('NFKD')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAllowedRoles() {
  return (
    Array.isArray(DIVISION_ROLE)
      ? DIVISION_ROLE
      : [DIVISION_ROLE]
  ).filter(Boolean);
}

function hasDivisionPermission(interaction) {
  const allowedRoles = getAllowedRoles();

  return (
    allowedRoles.length === 0 ||
    allowedRoles.some(roleId =>
      interaction.member?.roles?.cache?.has(roleId)
    )
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('division')
    .setDescription('View all divisions and their teams'),

  async execute(interaction, client) {
    try {
      if (!hasDivisionPermission(interaction)) {
        return interaction.reply({
          content: 'You do not have permission to use this command.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const divisions = await Divisions.find().sort({ name: 1 });

      if (divisions.length === 0) {
        return interaction.reply({
          content: 'There are no divisions yet.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (divisions.length > 25) {
        return interaction.reply({
          content: 'There are too many divisions to display in one menu.',
          flags: MessageFlags.Ephemeral,
        });
      }

const options = divisions.map(division =>
  new StringSelectMenuOptionBuilder()
    .setLabel(
      `${division.emoji || ''} ${division.name}`.trim().slice(0, 100)
    )
    .setValue(division._id.toString())
);
      const select = new StringSelectMenuBuilder()
        .setCustomId('select_division')
        .setPlaceholder('Choose a division...')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(select);

      return interaction.reply({
        content: 'Select a division to post its teams in this channel:',
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Error executing division command:', error);

      const reply = {
        content: 'An error occurred while loading the divisions.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        return interaction.followUp(reply).catch(() => {});
      }

      return interaction.reply(reply).catch(() => {});
    }
  },

  async handleSelect(interaction, client) {
    if (!hasDivisionPermission(interaction)) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();

    try {
      const divisionId = interaction.values[0];
      const division = await Divisions.findById(divisionId);

      if (!division) {
        return interaction.editReply({
          content: 'Division not found.',
          components: [],
          embeds: [],
        });
      }

      const teams = await Teams.find({
        division: division.name,
      }).sort({ name: 1 });

      if (teams.length === 0) {
        return interaction.editReply({
          content: `**${division.emoji || ''} ${division.name}** has no teams yet.`,
          components: [],
          embeds: [],
        });
      }

      await getGuildMembers(interaction.guild);

      const staff = await Staffs.find({
        teamRoleId: {
          $in: teams.map(team => team.roleId),
        },
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${division.emoji || ''} ${division.name}`)
        .setDescription(
          '**Teams in this division**\n' +
          'An overview of each team, its management, and player count.'
        )
        .setTimestamp();

      let addedTeams = 0;
      let omittedTeams = 0;

      for (const team of teams) {
        const teamStaff = staff.filter(
          entry => entry.teamRoleId === team.roleId
        );

        const chairman = teamStaff.find(
          entry => entry.position === 'chairman'
        );

        const manager = teamStaff.find(
          entry => entry.position === 'manager'
        );

        const assistant = teamStaff.find(
          entry => entry.position === 'assistant'
        );

        const chairmanText = chairman
          ? `<@${chairman.userId}>`
          : 'Vacant';

        const managerText = manager
          ? `<@${manager.userId}>`
          : 'Vacant';

        const assistantText = assistant
          ? `<@${assistant.userId}>`
          : 'Vacant';

        const role = interaction.guild.roles.cache.get(team.roleId);

        const playerCount = role
          ? role.members.size
          : 0;

        const field = {
          name: `${team.emoji || ''} ${team.name}`.slice(0, 256),
          value:
            `> **Chairman:** ${chairmanText}\n` +
            `> **Manager:** ${managerText}\n` +
            `> **Assistant Manager:** ${assistantText}\n` +
            `> **Players:** ${playerCount}/16`,
          inline: false,
        };

        const currentLength =
          (embed.data.title || '').length +
          (embed.data.description || '').length +
          (embed.data.fields || []).reduce(
            (total, existing) =>
              total + existing.name.length + existing.value.length,
            0
          );

        if (
          addedTeams >= 25 ||
          currentLength + field.name.length + field.value.length > 5800
        ) {
          omittedTeams++;
          continue;
        }

        embed.addFields(field);
        addedTeams++;
      }

      if (omittedTeams > 0) {
        embed.setFooter({
          text: `${omittedTeams} additional team(s) could not fit in this embed.`,
        });
      }

      // Post the division information publicly in the channel.
      await interaction.channel.send({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      // Clean up the original private selection menu.
      await interaction.editReply({
        content: 'Division information has been posted in the channel.',
        embeds: [],
        components: [],
      });
    } catch (error) {
      console.error('Error handling division select:', error);

      await interaction.editReply({
        content: 'An error occurred while loading the division. Please try again later.',
        components: [],
        embeds: [],
      }).catch(() => {});
    }
  },
};
