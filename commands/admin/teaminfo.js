
const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

const getGuildMembers = require("../../utils/getGuildMembers");

const Teams = require("../../models/teams");
const Staffs = require("../../models/staffs");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("teaminfo")
    .setDescription("View detailed information about any team"),

  async execute(interaction, client) {
    const teams = await Teams.find();

    if (!teams.length) {
      return interaction.reply({
        content: "There are no teams yet.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (teams.length > 25) {
      return interaction.reply({
        content: "There are too many teams to display in one menu.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("teaminfo-select")
      .setPlaceholder("Select a team...")
      .addOptions(
        teams.map(t => ({
          label: t.name.slice(0, 100),
          value: t.roleId,
          emoji: t.emoji || undefined,
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
      content: "Choose a team to view its information:",
      components: [row],
    });
  },

  async handleSelect(interaction, client) {
    await interaction.deferUpdate();

    try {
      const teamRoleId = interaction.values[0];

      const team = await Teams.findOne({
        roleId: teamRoleId,
      });

      if (!team) {
        return interaction.editReply({
          content: "This team no longer exists.",
          components: [],
        });
      }

      const staff = await Staffs.find({
        teamRoleId,
      });

      const chairman = staff.find(
        s => s.position === "chairman"
      );

      const manager = staff.find(
        s => s.position === "manager"
      );

      const assistant = staff.find(
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

      // Reuse the shared guild member fetch
      await getGuildMembers(interaction.guild);

      const role = interaction.guild.roles.cache.get(
        teamRoleId
      );

      const membersWithRole = role
        ? role.members
        : new Map();

      const playerLines = [];

      for (const [id] of membersWithRole) {
        let label = "(Player)";

        if (chairman && chairman.userId === id) {
          label = "(Chairman)";
        } else if (manager && manager.userId === id) {
          label = "(Manager)";
        } else if (assistant && assistant.userId === id) {
          label = "(Assistant Manager)";
        }

        playerLines.push(`• <@${id}> ${label}`);
      }

      if (playerLines.length === 0) {
        playerLines.push("*No players signed yet.*");
      }

      // Discord embed field values have a 1024-character limit
      let playerList = "";
      let omitted = 0;

      for (const line of playerLines) {
        const next = playerList
          ? `${playerList}\n${line}`
          : line;

        if (next.length > 950) {
          omitted++;
          continue;
        }

        playerList = next;
      }

      if (omitted > 0) {
        playerList += `\n...and ${omitted} more member(s).`;
      }

      const guildIcon = interaction.guild.iconURL({
        size: 256,
      });

      const thumbnail =
        team.emoji && team.emoji.startsWith("<")
          ? `https://cdn.discordapp.com/emojis/${team.emoji.replace(/\D/g, "")}.png?size=256&quality=lossless`
          : guildIcon;

      const embed = new EmbedBuilder()
        .setColor("#3498db")
        .setAuthor({
          name: interaction.guild.name,
          iconURL: guildIcon || undefined,
        })
        .setTitle(
          `${team.emoji} ${team.name} — Team Information`
        )
        .setThumbnail(thumbnail)
        .addFields(
          {
            name: "Chairman",
            value: chairmanText,
            inline: true,
          },
          {
            name: "Manager",
            value: managerText,
            inline: true,
          },
          {
            name: "Assistant Manager",
            value: assistantText,
            inline: true,
          },
          {
            name: `Players (${membersWithRole.size})`,
            value: playerList,
            inline: false,
          }
        )
        .setTimestamp();

      await interaction.editReply({
        content: "",
        embeds: [embed],
        components: [],
      });
    } catch (error) {
      console.error("Error handling teaminfo select:", error);

      await interaction.editReply({
        content: "An error occurred while loading team information. Please try again later.",
        components: [],
      }).catch(() => {});
    }
  },
};
