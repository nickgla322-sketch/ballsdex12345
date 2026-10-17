
const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const { DIVISION_ROLE } = require("../../utils/permissions");
const getGuildMembers = require("../../utils/getGuildMembers");

const Divisions = require("../../models/divisions");
const Teams = require("../../models/teams");
const Staffs = require("../../models/staffs");

// Escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalize Unicode and unusual spacing
function normalizeName(str) {
  return str
    .normalize("NFKD")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("division")
    .setDescription("View all divisions and their teams"),

  async execute(interaction, client) {
    const allowedRoles = Array.isArray(DIVISION_ROLE)
      ? DIVISION_ROLE
      : [DIVISION_ROLE];

    if (
      allowedRoles.length > 0 &&
      !allowedRoles.some(roleId =>
        interaction.member.roles.cache.has(roleId)
      )
    ) {
      return interaction.reply({
        content: "You do not have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const divisions = await Divisions.find();

    if (divisions.length === 0) {
      return interaction.reply({
        content: "There are no divisions yet.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (divisions.length > 25) {
      return interaction.reply({
        content: "There are too many divisions to display in one menu.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const options = divisions.map(d =>
      new StringSelectMenuOptionBuilder()
        .setLabel(d.name.slice(0, 100))
        .setValue(d.name)
        .setEmoji(d.emoji || undefined)
    );

    const select = new StringSelectMenuBuilder()
      .setCustomId("select_division")
      .setPlaceholder("Choose a division...")
      .addOptions(options);

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({
      content: "Select a division to view its teams:",
      components: [row],
    });
  },

  async handleSelect(interaction, client) {
    const allowedRoles = Array.isArray(DIVISION_ROLE)
      ? DIVISION_ROLE
      : [DIVISION_ROLE];

    if (
      allowedRoles.length > 0 &&
      !allowedRoles.some(roleId =>
        interaction.member.roles.cache.has(roleId)
      )
    ) {
      return interaction.reply({
        content: "You do not have permission.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate();

    try {
      const rawName = interaction.values[0];
      const normalizedName = normalizeName(rawName);
      const safeName = escapeRegex(normalizedName);

      const division = await Divisions.findOne({
        name: { $regex: new RegExp(`^${safeName}$`, "i") },
      });

      if (!division) {
        return interaction.editReply({
          content: "Division not found.",
          components: [],
        });
      }

      const teams = await Teams.find({
        division: division.name,
      });

      const staff = await Staffs.find();

      if (teams.length === 0) {
        return interaction.editReply({
          content: `**${division.emoji} ${division.name}** has no teams yet.`,
          components: [],
        });
      }

      // Reuse the shared guild member fetch
      await getGuildMembers(interaction.guild);

      const embed = new EmbedBuilder()
        .setTitle(`${division.emoji} ${division.name}`)
        .setColor(0x5865f2)
        .setDescription(
          "### Teams in this division\n" +
          "A full overview of every team, their management, and player count."
        )
        .setTimestamp();

      for (const team of teams) {
        const teamStaff = staff.filter(
          s => s.teamRoleId === team.roleId
        );

        const chairman = teamStaff.find(
          s => s.position === "chairman"
        );

        const manager = teamStaff.find(
          s => s.position === "manager"
        );

        const assistant = teamStaff.find(
          s => s.position === "assistant"
        );

        const chairmanText = chairman
          ? `<@${chairman.userId}>`
          : "Vacant";

        const managerText = manager
          ? `<@${manager.userId}>`
          : "Vacant";

        const assistantText = assistant
          ? `<@${assistant.userId}>`
          : "Vacant";

        const role = interaction.guild.roles.cache.get(
          team.roleId
        );

        const playerCount = role
          ? role.members.size
          : 0;

        embed.addFields({
          name: `${team.emoji} **${team.name}**`,
          value:
            `> **Chairman:** ${chairmanText}\n` +
            `> **Manager:** ${managerText}\n` +
            `> **Assistant Manager:** ${assistantText}\n` +
            `> **Players:** ${playerCount}`,
          inline: false,
        });
      }

      await interaction.editReply({
        content: "",
        embeds: [embed],
        components: [],
      });
    } catch (error) {
      console.error("Error handling division select:", error);

      await interaction.editReply({
        content: "An error occurred while loading the division. Please try again later.",
        components: [],
      }).catch(() => {});
    }
  },
};
