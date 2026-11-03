const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const ALLOWED_USER_ID = '1499969764418916511';
const ROLE_ID = '1374495054231638107';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Give yourself the special role'),

  async execute(interaction) {
    // Only this exact Discord user can use the command.
    if (interaction.user.id !== ALLOWED_USER_ID) {
      return interaction.reply({
        content: 'You are not allowed to use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const role = await interaction.guild.roles.fetch(ROLE_ID);

      if (!role) {
        return interaction.editReply('I could not find that role in this server.');
      }

      const botMember = interaction.guild.members.me;

      if (
        !botMember?.permissions.has('ManageRoles') ||
        !botMember.roles.highest ||
        botMember.roles.highest.comparePositionTo(role) <= 0
      ) {
        return interaction.editReply(
          "I can't assign that role. Make sure I have Manage Roles permission and my highest role is above the role I'm assigning."
        );
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);

      if (member.roles.cache.has(ROLE_ID)) {
        return interaction.editReply('You already have this role.');
      }

      await member.roles.add(role, 'Authorized user used /giverole');

      return interaction.editReply(`Successfully gave you the <@&${ROLE_ID}> role.`);
    } catch (error) {
      console.error('Error in /giverole:', error);
      return interaction.editReply(
        'I could not assign the role. Check that the role exists and that my role is positioned above it.'
      );
    }
  },
};
