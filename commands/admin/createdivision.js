
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { CREATE_DIVISION_ROLE } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');
const Divisions = require('../../models/divisions');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getEmojiImageUrl(emoji) {
  if (!emoji) return null;

  const match = emoji.match(/<a?:\w+:(\d+)>/);

  if (!match) return null;

  const extension = emoji.startsWith('<a:') ? 'gif' : 'webp';

  return `https://cdn.discordapp.com/emojis/${match[1]}.${extension}?size=256&quality=lossless`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createdivision')
    .setDescription('Create a new division')
    .addStringOption(opt =>
      opt
        .setName('name')
        .setDescription('Division name')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('emoji')
        .setDescription('Division emoji')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    try {
      // Permission check
      const allowedRoles = Array.isArray(CREATE_DIVISION_ROLE)
        ? CREATE_DIVISION_ROLE
        : [CREATE_DIVISION_ROLE];

      if (
        allowedRoles.length > 0 &&
        !allowedRoles.some(
          roleId =>
            roleId && interaction.member.roles.cache.has(roleId)
        )
      ) {
        return interaction.reply({
          content: 'You do not have permission to use this command.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Normalize division name
      const name = interaction.options
        .getString('name')
        .normalize('NFKD')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const emoji = interaction.options.getString('emoji').trim();

      if (!name) {
        return interaction.reply({
          content: 'The division name cannot be empty.',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Escape regex characters
      const safeName = escapeRegex(name);

      // Check for duplicate division names
      const existing = await Divisions.findOne({
        name: { $regex: new RegExp(`^${safeName}$`, 'i') },
      });

      if (existing) {
        return interaction.reply({
          content: `A division named **${name}** already exists.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // Save division
      await Divisions.create({
        name,
        emoji,
      });

      const guild = interaction.guild;

      // Create log embed
      const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setAuthor({
          name: guild.name,
          iconURL: guild.iconURL({ size: 256 }) || undefined,
        })
        .setTitle('Division Created')
        .addFields(
          {
            name: 'Division Name',
            value: `**${name}**`,
            inline: false,
          },
          {
            name: 'Emoji',
            value: emoji,
            inline: false,
          },
          {
            name: 'Created By',
            value: `<@${interaction.user.id}>`,
            inline: false,
          }
        )
        .setTimestamp();

      const emojiImageUrl = getEmojiImageUrl(emoji);

      if (emojiImageUrl) {
        embed.setThumbnail(emojiImageUrl);
      } else if (guild.iconURL()) {
        embed.setThumbnail(guild.iconURL({ size: 256 }));
      }

      // Log without pinging anyone
      await logAction(client, {
        embeds: [embed],
        allowedMentions: { parse: [] },
      });

      // Confirm creation
      await interaction.reply({
        content: `Division ${emoji} **${name}** has been created.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Error in /createdivision:', error);

      const errorMessage = {
        content: 'An error occurred while creating the division.',
        flags: MessageFlags.Ephemeral,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage).catch(() => {});
      } else {
        await interaction.reply(errorMessage).catch(() => {});
      }
    }
  },
};
