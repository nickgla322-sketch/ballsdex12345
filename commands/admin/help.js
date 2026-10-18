
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const PURPLE = '#9b59b6';

// Role IDs
const ROLES = {
  PRESIDENT: '<@&1374495054231638107>',
  VICE_PRESIDENT: '<@&1374495059470188636>',
  BOARD_OF_DIRECTORS: '<@&1374495064901812285>',
  LEAGUE_COORDINATOR: '<@&1374495075819847680>',
  DIRECTOR: '<@&1374495070157406219>',

  CHAIRMAN: '<@&1374495155310297099>',
  MANAGER: '<@&1374495160632610918>',
  ASSISTANT_MANAGER: '<@&1374495166651437169>',
};

const LEAGUE_MANAGEMENT =
  `${ROLES.BOARD_OF_DIRECTORS} ${ROLES.VICE_PRESIDENT} ` +
  `${ROLES.PRESIDENT} ${ROLES.LEAGUE_COORDINATOR} ${ROLES.DIRECTOR}`;

const TEAM_STAFF =
  `${ROLES.ASSISTANT_MANAGER} ${ROLES.MANAGER} ${ROLES.CHAIRMAN}`;

const commandCategories = [
  {
    name: '🏆 Team Management',
    description: 'Commands for creating, managing, and removing teams.',
    commands: [
      {
        name: '/addteam',
        description: 'Creates a new team in a division.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/sign',
        description: 'Signs a player to your team and updates their roles.',
        permission: `${TEAM_STAFF}\nRequires a team staff record.`,
      },
      {
        name: '/release',
        description: 'Releases a player from your team and gives them the Free Agent role.',
        permission: `${TEAM_STAFF}\nRequires a team staff record.`,
      },
      {
        name: '/disband',
        description: 'Removes players and staff roles from a team but keeps the team and division.',
        permission:
          `${ROLES.VICE_PRESIDENT} ${ROLES.PRESIDENT} ${ROLES.DIRECTOR}`,
      },
      {
        name: '/removeteam',
        description: 'Permanently removes a team and processes its players, staff roles, and records.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/teaminfo',
        description: 'Displays information about a selected team.',
        permission: 'Check the command’s access rules.',
      },
    ],
  },
  {
    name: '👔 Staff Management',
    description: 'Commands for appointing, promoting, demoting, and removing staff.',
    commands: [
      {
        name: '/appoint',
        description: 'Appoints a player to a staff position on a team.',
        permission: LEAGUE_MANAGEMENT,
      },
      {
        name: '/promote',
        description: 'Promotes a team member to Assistant Manager or Manager.',
        permission:
          `${ROLES.MANAGER} ${ROLES.CHAIRMAN}\n` +
          'Requires a staff record and a higher rank than the position being assigned.',
      },
      {
        name: '/demote',
        description: 'Demotes a staff member, subject to team hierarchy rules.',
        permission:
          `${ROLES.CHAIRMAN} ${ROLES.MANAGER}\n` +
          'Must outrank the target on the same team.',
      },
      {
        name: '/sack',
        description: 'Removes a staff member from a management position without removing them from the team.',
        permission: LEAGUE_MANAGEMENT,
      },
    ],
  },
  {
    name: '🏛️ Division Management',
    description: 'Commands for creating, removing, and viewing divisions.',
    commands: [
      {
        name: '/createdivision',
        description: 'Creates a new division.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/removedivision',
        description: 'Removes a division and its teams, processes affected players, and gives eligible players the Free Agent role.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/division',
        description: 'Displays division information.',
        permission: LEAGUE_MANAGEMENT,
      },
      {
        name: '/debugdivisions',
        description: 'Helps inspect or troubleshoot division data.',
        permission: 'Check the command’s access rules.',
      },
    ],
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all bot commands and their permissions'),

  async execute(interaction) {
    const embeds = [
      new EmbedBuilder()
        .setColor(PURPLE)
        .setTitle('📖 League Bot Command Guide')
        .setDescription(
          'Welcome to the league bot command guide!\n\n' +
          'Commands are organized by category. Each command lists ' +
          'the roles allowed to use it and any extra requirements.\n\n' +
          '**Role names are shown below each command.** ' +
          'Some commands also require a specific team staff record or rank.'
        )
        .setFooter({
          text: 'League Management Bot',
        }),
    ];

    for (const category of commandCategories) {
      const embed = new EmbedBuilder()
        .setColor(PURPLE)
        .setTitle(category.name)
        .setDescription(category.description);

      for (const command of category.commands) {
        embed.addFields({
          name: command.name,
          value:
            `${command.description}\n\n` +
            `**Who can use it:**\n${command.permission}`,
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
