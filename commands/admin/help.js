
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { logAction } = require('../../utils/logger');

const PURPLE = '#9b59b6';

const commandCategories = [
  {
    name: '🏆 Team Management',
    description: 'Create, manage, and remove teams.',
    commands: [
      {
        name: '/addteam',
        description: 'Adds a new team to a division.',
        permission: 'ADD_TEAM_ROLE',
      },
      {
        name: '/sign',
        description: 'Signs a player to your team and updates their roles.',
        permission: 'SIGN_ROLE; requires a team staff record.',
      },
      {
        name: '/release',
        description: 'Releases a player from your team and gives them Free Agent status.',
        permission: 'RELEASE_ROLE; requires a team staff record.',
      },
      {
        name: '/disband',
        description: 'Removes all players and staff roles from a team without deleting the team itself.',
        permission: 'DISBAND_ROLE',
      },
      {
        name: '/removeteam',
        description: 'Permanently removes a team and processes its players, staff roles, and records.',
        permission: 'REMOVE_TEAM_ROLE',
      },
      {
        name: '/teaminfo',
        description: 'Displays information about a selected team.',
        permission: 'Check teaminfo.js for its access requirements.',
      },
    ],
  },
  {
    name: '👔 Staff Management',
    description: 'Appoint, promote, demote, or remove staff.',
    commands: [
      {
        name: '/appoint',
        description: 'Appoints a player to a staff position on a selected team.',
        permission: 'APPOINT_ROLE',
      },
      {
        name: '/promote',
        description: 'Promotes an existing staff member.',
        permission: 'Check promote.js for its access requirements.',
      },
      {
        name: '/demote',
        description: 'Demotes a staff member, subject to staff hierarchy rules.',
        permission: 'DEMOTE_ROLE; must outrank the target on the same team.',
      },
      {
        name: '/sack',
        description: 'Removes a staff member from their position.',
        permission: 'Check sack.js for its access requirements.',
      },
    ],
  },
  {
    name: '🏛️ Divisions',
    description: 'Manage and view league divisions.',
    commands: [
      {
        name: '/createdivision',
        description: 'Creates a new division.',
        permission: 'CREATE_DIVISION_ROLE',
      },
      {
        name: '/removedivision',
        description: 'Removes a division.',
        permission: 'Check removedivision.js for its access requirements.',
      },
      {
        name: '/division',
        description: 'Displays division information.',
        permission: 'DIVISION_ROLE',
      },
      {
        name: '/debugdivisions',
        description: 'Helps inspect or troubleshoot division data.',
        permission: 'Check debugdivisions.js for its access requirements.',
      },
    ],
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all bot commands and their permissions'),

  async execute(interaction) {
    const embeds = commandCategories.map(category => {
      const embed = new EmbedBuilder()
        .setColor(PURPLE)
        .setTitle(category.name)
        .setDescription(category.description);

      for (const command of category.commands) {
        embed.addFields({
          name: command.name,
          value:
            `${command.description}\n` +
            `**Who can use it:** ${command.permission}`,
          inline: false,
        });
      }

      return embed;
    });

    embeds.unshift(
      new EmbedBuilder()
        .setColor(PURPLE)
        .setTitle('📖 Bot Command Help')
        .setDescription(
          'Welcome to the league bot command guide!\n\n' +
          'Commands are organized by category below. ' +
          'Some commands require specific league permissions or team staff positions.\n\n' +
          'Use only the commands you are authorized to access.'
        )
        .setFooter({
          text: 'League Management Bot',
        })
    );

    return interaction.reply({
      embeds,
      flags: MessageFlags.Ephemeral,
    });
  },
};
