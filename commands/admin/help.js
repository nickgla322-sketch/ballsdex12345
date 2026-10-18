
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const PURPLE = '#9b59b6';

const ROLES = {
  PRESIDENT: 'President',
  VICE_PRESIDENT: 'Vice President',
  BOARD: 'Board of Directors',
  COORDINATOR: 'League Coordinator',
  DIRECTOR: 'Director',
  CHAIRMAN: 'Chairman',
  MANAGER: 'Manager',
  ASSISTANT: 'Assistant Manager',
};

const LEAGUE_MANAGEMENT = [
  ROLES.BOARD,
  ROLES.VICE_PRESIDENT,
  ROLES.PRESIDENT,
  ROLES.COORDINATOR,
  ROLES.DIRECTOR,
].join(', ');

const TEAM_STAFF = [
  ROLES.ASSISTANT,
  ROLES.MANAGER,
  ROLES.CHAIRMAN,
].join(', ');

const commandCategories = [
  {
    name: '🏆 Team Management',
    description: 'Create and manage teams.',
    commands: [
      {
        name: '/addteam',
        description: 'Creates a team.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/sign',
        description: 'Signs a player to your team.',
        permission: `${TEAM_STAFF} (team staff record required)`,
      },
      {
        name: '/release',
        description: 'Releases a player from your team.',
        permission: `${TEAM_STAFF} (team staff record required)`,
      },
      {
        name: '/disband',
        description: 'Clears a team but keeps it registered.',
        permission: [
          ROLES.VICE_PRESIDENT,
          ROLES.PRESIDENT,
          ROLES.DIRECTOR,
        ].join(', '),
      },
      {
        name: '/removeteam',
        description: 'Permanently removes a team.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/teaminfo',
        description: 'Shows team information.',
        permission: 'Check teaminfo.js for access rules.',
      },
    ],
  },
  {
    name: '👔 Staff Management',
    description: 'Manage team staff positions.',
    commands: [
      {
        name: '/appoint',
        description: 'Appoints a staff member.',
        permission: LEAGUE_MANAGEMENT,
      },
      {
        name: '/promote',
        description: 'Promotes a team member.',
        permission:
          `${ROLES.MANAGER}, ${ROLES.CHAIRMAN} ` +
          '(must outrank the position assigned)',
      },
      {
        name: '/demote',
        description: 'Demotes a staff member.',
        permission:
          `${ROLES.CHAIRMAN}, ${ROLES.MANAGER} ` +
          '(must outrank the target on the same team)',
      },
      {
        name: '/sack',
        description: 'Removes a staff position.',
        permission: LEAGUE_MANAGEMENT,
      },
    ],
  },
  {
    name: '🏛️ Division Management',
    description: 'Create, remove, and view divisions.',
    commands: [
      {
        name: '/createdivision',
        description: 'Creates a division.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/removedivision',
        description: 'Deletes a division and its teams.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/division',
        description: 'Shows division information.',
        permission: LEAGUE_MANAGEMENT,
      },
      {
        name: '/debugdivisions',
        description: 'Checks division data for issues.',
        permission: 'Check debugdivisions.js for access rules.',
      },
    ],
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View commands and their permissions'),

  async execute(interaction) {
    const embeds = [];

    const intro = new EmbedBuilder()
      .setColor(PURPLE)
      .setTitle('📖 League Bot Help')
      .setDescription(
        '**Command Guide**\n' +
        'Find commands by category below.\n\n' +
        '**Team Management** — Teams and players\n' +
        '**Staff Management** — Staff positions\n' +
        '**Division Management** — League divisions'
      )
      .setFooter({
        text: 'League Management Bot',
      });

    embeds.push(intro);

    for (const category of commandCategories) {
      const embed = new EmbedBuilder()
        .setColor(PURPLE)
        .setTitle(category.name)
        .setDescription(category.description);

      for (const command of category.commands) {
        embed.addFields({
          name: command.name,
          value:
            `${command.description}\n` +
            `**Allowed roles:** ${command.permission}`,
          inline: false,
        });
      }

      embeds.push(embed);
    }

    return interaction.reply({
      embeds,
      flags: MessageFlags.Ephemeral,
      allowedMentions: {
        parse: [],
      },
    });
  },
};
