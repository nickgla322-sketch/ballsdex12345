
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { logAction } = require('../../utils/logger');

const PURPLE = '#9b59b6';

const ROLES = {
  PRESIDENT: 'President',
  VICE_PRESIDENT: 'Vice President',
  BOARD: 'Board of Directors',
  DIRECTOR: 'Director',
  COORDINATOR: 'League Coordinator',
  CHAIRMAN: 'Chairman',
  MANAGER: 'Manager',
  ASSISTANT_MANAGER: 'Assistant Manager',
};

const LEAGUE_MANAGEMENT = [
  ROLES.PRESIDENT,
  ROLES.VICE_PRESIDENT,
  ROLES.BOARD,
  ROLES.DIRECTOR,
  ROLES.COORDINATOR,
];

const TEAM_STAFF = [
  ROLES.CHAIRMAN,
  ROLES.MANAGER,
  ROLES.ASSISTANT_MANAGER,
];

const commandCategories = [
  {
    name: 'Team Management',
    description: 'Manage teams and their players.',
    commands: [
      {
        name: '/addteam',
        description: 'Add a new team.',
        roles: LEAGUE_MANAGEMENT,
      },
      {
        name: '/sign',
        description: 'Sign a player to a team.',
        roles: TEAM_STAFF,
      },
      {
        name: '/release',
        description: 'Release a player from a team.',
        roles: TEAM_STAFF,
      },
      {
        name: '/disband',
        description: 'Clear a team’s roster.',
        roles: LEAGUE_MANAGEMENT,
      },
      {
        name: '/removeteam',
        description: 'Remove a team from the league.',
        roles: LEAGUE_MANAGEMENT,
      },
      {
        name: '/teaminfo',
        description: 'View team information.',
        roles: [...LEAGUE_MANAGEMENT, ...TEAM_STAFF],
      },
    ],
  },
  {
    name: 'Staff Management',
    description: 'Manage team staff and appointments.',
    commands: [
      {
        name: '/appoint',
        description: 'Appoint staff to a team.',
        roles: LEAGUE_MANAGEMENT,
      },
      {
        name: '/promote',
        description: 'Promote a staff member.',
        roles: LEAGUE_MANAGEMENT,
      },
      {
        name: '/demote',
        description: 'Demote a staff member.',
        roles: LEAGUE_MANAGEMENT,
      },
      {
        name: '/sack',
        description: 'Remove a staff member.',
        roles: LEAGUE_MANAGEMENT,
      },
    ],
  },
  {
    name: 'Division Management',
    description: 'Create and manage league divisions.',
    commands: [
      {
        name: '/createdivision',
        description: 'Create a division.',
        roles: LEAGUE_MANAGEMENT,
      },
      {
        name: '/removedivision',
        description: 'Remove a division.',
        roles: LEAGUE_MANAGEMENT,
      },
      {
        name: '/division',
        description: 'View division information.',
        roles: LEAGUE_MANAGEMENT,
      },
      {
        name: '/debugdivisions',
        description: 'View division debug information.',
        roles: LEAGUE_MANAGEMENT,
      },
    ],
  },
];

function createCategoryEmbed(category) {
  const embed = new EmbedBuilder()
    .setColor(PURPLE)
    .setTitle(category.name)
    .setDescription(category.description);

  for (const command of category.commands) {
    embed.addFields({
      name: `\`${command.name}\``,
      value: [
        command.description,
        `*Access:* ${command.roles.join(', ')}`,
      ].join('\n'),
      inline: false,
    });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View available league bot commands.'),

  async execute(interaction) {
    const introEmbed = new EmbedBuilder()
      .setColor(PURPLE)
      .setTitle('League Bot — Help')
      .setDescription(
        'Browse the available commands below. Each command lists the roles required to use it.'
      )
      .setFooter({
        text: 'League Management System',
      });

    const embeds = [
      introEmbed,
      ...commandCategories.map(createCategoryEmbed),
    ];

    await interaction.reply({
      embeds,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });

    await logAction(
      interaction.guild,
      'Help Command',
      `${interaction.user.tag} viewed the help menu.`
    );
  },
};
