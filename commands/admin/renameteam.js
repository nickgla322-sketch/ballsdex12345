const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { ADD_TEAM_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

const Teams = require('../../models/teams');
const Staffs = require('../../models/staffs');

function hasPermission(interaction) {
  const allowedRoles = (
    Array.isArray(ADD_TEAM_ROLE) ? ADD_TEAM_ROLE : [ADD_TEAM_ROLE]
  ).filter(Boolean);

  return allowedRoles.some(roleId =>
    interaction.member?.roles?.cache?.has(roleId)
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('renameteam')
    .setDescription("Change a team's name, Discord role, and emoji")
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('The new Discord role for this team')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('emoji')
        .setDescription('The new team emoji')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    if (!hasPermission(interaction)) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const newRole = interaction.options.getRole('role');
    const newEmoji = interaction.options.getString('emoji').trim();

    if (!newEmoji) {
      return interaction.reply({
        content: 'Please provide a valid emoji.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botMember = interaction.guild.members.me;

    if (
      newRole.managed ||
      !botMember ||
      botMember.roles.highest.comparePositionTo(newRole) <= 0
    ) {
      return interaction.reply({
        content: "I can't manage that role. Make sure it isn't managed and is below my highest role.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let collector;

    try {
      const teams = await Teams.find().sort({ name: 1 });

      if (!teams.length) {
        return interaction.editReply('There are no registered teams.');
      }

      if (teams.length > 25) {
        return interaction.editReply(
          'There are more than 25 teams, so they cannot all fit in one menu.'
        );
      }

      const existingTeamForRole = await Teams.findOne({
        roleId: newRole.id,
      });

      const teamMenu = new StringSelectMenuBuilder()
        .setCustomId('rename-team-select')
        .setPlaceholder('Select the team you want to edit')
        .addOptions(
          teams.map(team => ({
            label: team.name.slice(0, 100),
            value: String(team._id),
            ...(team.emoji ? { emoji: team.emoji } : {}),
            description: team.division
              ? `Division: ${team.division}`.slice(0, 100)
              : undefined,
          }))
        );

      await interaction.editReply({
        content:
          `New role: <@&${newRole.id}>\nNew emoji: ${newEmoji}\n\n` +
          'Select the team you want to rename:',
        components: [new ActionRowBuilder().addComponents(teamMenu)],
        allowedMentions: { parse: [] },
      });

      const response = await interaction.fetchReply();

      collector = response.createMessageComponentCollector({
        filter: i =>
          i.customId === 'rename-team-select' &&
          i.user.id === interaction.user.id,
        time: 60_000,
      });

      collector.on('collect', async i => {
        try {
          await i.deferUpdate();

          const team = await Teams.findById(i.values[0]);

          if (!team) {
            collector.stop('error');
            return interaction.editReply({
              content: 'That team could not be found. Please try again.',
              components: [],
            });
          }

          if (existingTeamForRole && String(existingTeamForRole._id) !== String(team._id)) {
            collector.stop('error');
            return interaction.editReply({
              content: 'That Discord role is already registered to another team.',
              components: [],
            });
          }

          const oldName = team.name;
          const oldEmoji = team.emoji || '';
          const oldRoleId = team.roleId;
          const oldRole = interaction.guild.roles.cache.get(oldRoleId);

          // Add the new role to every current holder before changing the team record.
          // The old role stays in place if any assignment fails.
          let membersToMigrate = [];

          if (oldRole && oldRole.id !== newRole.id) {
            await interaction.guild.members.fetch();
            membersToMigrate = [...oldRole.members.values()];

            const additions = await Promise.allSettled(
              membersToMigrate.map(member =>
                member.roles.add(newRole, 'Team role updated through /renameteam')
              )
            );

            const failedAdds = additions.filter(result => result.status === 'rejected');

            if (failedAdds.length) {
              collector.stop('error');
              return interaction.editReply({
                content:
                  `I couldn't assign the new role to ${failedAdds.length} member(s). ` +
                  'The team record was not changed, and the old role was left in place.',
                components: [],
              });
            }
          }

          const updateResult = await Teams.updateOne(
            { _id: team._id, roleId: oldRoleId },
            {
              $set: {
                name: newRole.name,
                roleId: newRole.id,
                emoji: newEmoji,
              },
            }
          );

          if (updateResult.matchedCount !== 1) {
            collector.stop('error');
            return interaction.editReply({
              content:
                'The team changed while this command was running, so its details were not updated. ' +
                'The new role may have been added to some members; no old roles were removed.',
              components: [],
            });
          }

          // Keep staff assignments linked to the team's new role and name.
          await Staffs.updateMany(
            { teamRoleId: oldRoleId },
            {
              $set: {
                teamRoleId: newRole.id,
                teamName: newRole.name,
              },
            }
          );

          // Remove the old team role only after the database update succeeds.
          let failedRemovals = 0;

          if (oldRole && oldRole.id !== newRole.id) {
            const removals = await Promise.allSettled(
              membersToMigrate.map(member =>
                member.roles.remove(oldRole, 'Team role updated through /renameteam')
              )
            );

            failedRemovals = removals.filter(
              result => result.status === 'rejected'
            ).length;
          }

          const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle('Team Updated')
            .addFields(
              {
                name: 'Previous Team',
                value: `${oldEmoji} **${oldName}** (<@&${oldRoleId}>)`,
                inline: false,
              },
              {
                name: 'New Team',
                value: `${newEmoji} **${newRole.name}** (<@&${newRole.id}>)`,
                inline: false,
              },
              {
                name: 'Updated By',
                value: `<@${interaction.user.id}>`,
                inline: false,
              },
              ...(failedRemovals
                ? [{
                    name: 'Role cleanup',
                    value: `The new role was assigned, but the old role could not be removed from ${failedRemovals} member(s).`,
                    inline: false,
                  }]
                : [])
            )
            .setTimestamp();

          await logAction(client, {
            embeds: [embed],
            allowedMentions: { parse: [] },
          });

          collector.stop('completed');

          return interaction.editReply({
            content:
              `Successfully updated **${oldName}** to ${newEmoji} **${newRole.name}**.\n` +
              `Role: <@&${newRole.id}>\n` +
              (oldRole && oldRole.id !== newRole.id
                ? `Updated the role for ${membersToMigrate.length - failedRemovals} member(s).`
                : 'No member role changes were needed.') +
              (failedRemovals
                ? `\nThe old role could not be removed from ${failedRemovals} member(s).`
                : ''),
            components: [],
            allowedMentions: { parse: [] },
          });
        } catch (error) {
          console.error('Error in /renameteam:', error);
          collector.stop('error');

          await interaction.editReply({
            content: 'An error occurred while updating the team. Check the bot console.',
            components: [],
          }).catch(() => {});
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'completed' || reason === 'error') return;

        if (reason === 'time' || collected.size === 0) {
          await interaction.editReply({
            content: 'No team selected. Command cancelled.',
            components: [],
          }).catch(() => {});
        }
      });
    } catch (error) {
      console.error('Failed to start /renameteam:', error);
      collector?.stop('error');

      await interaction.editReply({
        content: 'Something went wrong loading the teams. Check the bot console.',
        components: [],
      }).catch(() => {});
    }
  },
};
