
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { DIVISION_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

const Divisions = require('../../models/divisions');
const Teams = require('../../models/teams');

function normalizeName(str) {
  return str
    .normalize('NFKD')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAllowedRoles() {
  return (Array.isArray(DIVISION_ROLE)
    ? DIVISION_ROLE
    : [DIVISION_ROLE]
  ).filter(Boolean);
}

function hasPermission(interaction) {
  const roles = getAllowedRoles();

  return (
    roles.length === 0 ||
    roles.some(roleId =>
      interaction.member?.roles?.cache?.has(roleId)
    )
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('renamedivision')
    .setDescription('Rename a division or change its emojis')
    .addStringOption(option =>
      option
        .setName('new_name')
        .setDescription('New division name (optional)')
        .setRequired(false)
        .setMaxLength(100)
    )
    .addStringOption(option =>
      option
        .setName('emoji')
        .setDescription('New emoji or two emojis (optional)')
        .setRequired(false)
        .setMaxLength(100)
    ),

  async execute(interaction, client) {
    if (!hasPermission(interaction)) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const newNameInput = interaction.options.getString('new_name');
    const newEmojiInput = interaction.options.getString('emoji');

    const newName = newNameInput === null
      ? null
      : normalizeName(newNameInput);

    const newEmoji = newEmojiInput === null
      ? null
      : newEmojiInput.trim();

    if (newName === '' || newEmoji === '') {
      return interaction.reply({
        content: 'The new name and emoji cannot be empty.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (newName === null && newEmoji === null) {
      return interaction.reply({
        content: 'Provide a new name, new emoji, or both.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const divisions = await Divisions.find().sort({ name: 1 });

      if (!divisions.length) {
        return interaction.reply({
          content: 'There are no divisions to edit.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (divisions.length > 25) {
        return interaction.reply({
          content: 'There are too many divisions to display in one menu.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId('rename-division-select')
        .setPlaceholder('Select a division to edit')
        .addOptions(
          divisions.map(division => ({
            label: division.name.slice(0, 100),
            value: String(division._id),
            description: `${division.emoji || 'No emoji'}`
              .slice(0, 100),
          }))
        );

      await interaction.reply({
        content: 'Choose the division you want to edit:',
        components: [
          new ActionRowBuilder().addComponents(menu),
        ],
        flags: MessageFlags.Ephemeral,
      });

      const response = await interaction.fetchReply();

      const collector = response.createMessageComponentCollector({
        filter: i =>
          i.customId === 'rename-division-select' &&
          i.user.id === interaction.user.id,
        time: 60_000,
        max: 1,
      });

      collector.on('collect', async i => {
        await i.deferUpdate();

        try {
          const division = await Divisions.findById(i.values[0]);

          if (!division) {
            return interaction.editReply({
              content: 'That division no longer exists.',
              components: [],
            });
          }

          const oldName = division.name;
          const oldEmoji = division.emoji || 'None';

          const finalName = newName ?? oldName;
          const finalEmoji = newEmoji ?? division.emoji;

          if (newName !== null && newName !== oldName) {
            const duplicate = await Divisions.findOne({
              _id: { $ne: division._id },
              name: {
                $regex: new RegExp(
                  `^${finalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                  'i'
                ),
              },
            });

            if (duplicate) {
              return interaction.editReply({
                content: `A division named **${finalName}** already exists.`,
                components: [],
              });
            }
          }

          // Rename team references and the division record as one recoverable
          // operation. If saving the division fails, restore the team references.
          if (finalName !== oldName) {
            await Teams.updateMany(
              { division: oldName },
              { $set: { division: finalName } }
            );
          }

          try {
            division.name = finalName;
            division.emoji = finalEmoji;
            await division.save();
          } catch (saveError) {
            if (finalName !== oldName) {
              await Teams.updateMany(
                { division: finalName },
                { $set: { division: oldName } }
              ).catch(rollbackError => {
                console.error('CRITICAL: failed to roll back division team references:', rollbackError);
              });
            }
            throw saveError;
          }

          const embed = new EmbedBuilder()
            .setColor('#f1c40f')
            .setTitle('Division Updated')
            .addFields(
              {
                name: 'Previous Name',
                value: oldName,
                inline: true,
              },
              {
                name: 'New Name',
                value: finalName,
                inline: true,
              },
              {
                name: 'Previous Emoji(s)',
                value: oldEmoji,
                inline: true,
              },
              {
                name: 'New Emoji(s)',
                value: finalEmoji || 'None',
                inline: true,
              },
              {
                name: 'Updated By',
                value: `<@${interaction.user.id}>`,
                inline: false,
              }
            )
            .setTimestamp();

          await logAction(client, {
            embeds: [embed],
            allowedMentions: { parse: [] },
          });

          await interaction.editReply({
            content:
              `Division updated successfully!\n\n` +
              `**Division:** ${finalEmoji || ''} ${finalName}\n` +
              `**Teams affected:** Their division references were updated ` +
              `without changing the teams themselves.`,
            embeds: [],
            components: [],
            allowedMentions: { parse: [] },
          });
        } catch (error) {
          console.error('Error renaming division:', error);

          await interaction.editReply({
            content:
              'An error occurred while updating the division. Check the bot console.',
            components: [],
            embeds: [],
          }).catch(() => {});
        }
      });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          await interaction.editReply({
            content: 'No division selected. Command cancelled.',
            components: [],
          }).catch(() => {});
        }
      });
    } catch (error) {
      console.error('Error executing /renamedivision:', error);

      const reply = {
        content: 'An error occurred while loading the divisions.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        return interaction.editReply({
          content: reply.content,
          components: [],
        }).catch(() => {});
      }

      return interaction.reply(reply).catch(() => {});
    }
  },
};
