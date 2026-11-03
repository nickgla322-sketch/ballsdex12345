const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const ALLOWED_USER_ID = '1499969764418916511';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove roles from a member')
    .addSubcommand(subcommand =>
      subcommand
        .setName('all-roles')
        .setDescription('Remove all manageable roles from a member')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('The member whose roles should be removed')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    // Only this exact Discord user can use this command.
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

    const targetUser = interaction.options.getUser('user', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const [target, botMember] = await Promise.all([
        interaction.guild.members.fetch(targetUser.id),
        interaction.guild.members.fetchMe(),
      ]);

      if (!botMember.permissions.has('ManageRoles')) {
        return interaction.editReply(
          'I need the Manage Roles permission to remove roles.'
        );
      }

      const removableRoles = target.roles.cache.filter(role =>
        role.id !== interaction.guild.id &&
        !role.managed &&
        botMember.roles.highest.comparePositionTo(role) > 0
      );

      if (removableRoles.size === 0) {
        return interaction.editReply(
          'That member has no roles I can remove. The @everyone role and roles above my highest role or managed by integrations cannot be removed.'
        );
      }

      await target.roles.remove(
        [...removableRoles.keys()],
        `All manageable roles removed by authorized user ${interaction.user.id}`
      );

      return interaction.editReply(
        `Removed **${removableRoles.size}** role(s) from <@${target.id}>.`
      );
    } catch (error) {
      console.error('Error in /remove all-roles:', error);
      return interaction.editReply(
        'I could not remove the roles. Check my Manage Roles permission and role position.'
      );
    }
  },
};
