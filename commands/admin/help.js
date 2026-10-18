
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
    description: 'Manage teams, signings, and players.',
    emoji: '⚽',
    commands: [
      {
        name: '/addteam',
        emoji: '➕',
        description: 'Creates a new team.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/sign',
        emoji: '📝',
        description: 'Signs a player to your team.',
        permission: `${TEAM_STAFF} (staff record required)`,
      },
      {
        name: '/release',
        emoji: '📤',
        description: 'Releases a player from your team.',
        permission: `${TEAM_STAFF} (staff record required)`,
      },
      {
        name: '/disband',
        emoji: '🧹',
        description: 'Removes all players and staff.',
        permission: [
          ROLES.VICE_PRESIDENT,
          ROLES.PRESIDENT,
          ROLES.DIRECTOR,
        ].join(', '),
      },
      {
        name: '/removeteam',
        emoji: '🗑️',
        description: 'Permanently deletes a team.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/teaminfo',
        emoji: '📋',
        description: 'Views team information.',
        permission: 'See command access rules.',
      },
    ],
  },
  {
    name: '👔 Staff Management',
    description: 'Appoint, promote, and manage team staff.',
    emoji: '👥',
    commands: [
      {
        name: '/appoint',
        emoji: '📌',
        description: 'Appoints a team staff member.',
        permission: LEAGUE_MANAGEMENT,
      },
      {
        name: '/promote',
        emoji: '⬆️',
        description: 'Promotes a team member.',
        permission:
          `${ROLES.MANAGER}, ${ROLES.CHAIRMAN} ` +
          '(must outrank target)',
      },
      {
        name: '/demote',
        emoji: '⬇️',
        description: 'Demotes a staff member.',
        permission:
          `${ROLES.CHAIRMAN}, ${ROLES.MANAGER} ` +
          '(same team; must outrank target)',
      },
      {
        name: '/sack',
        emoji: '🚫',
        description: 'Removes a staff position.',
        permission: LEAGUE_MANAGEMENT,
      },
    ],
  },
  {
    name: '🏛️ Division Management',
    description: 'Manage league divisions and their teams.',
    emoji: '🗂️',
    commands: [
      {
        name: '/createdivision',
        emoji: '➕',
        description: 'Creates a division.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/removedivision',
        emoji: '🗑️',
        description: 'Deletes a division and its teams.',
        permission: ROLES.PRESIDENT,
      },
      {
        name: '/division',
        emoji: '📊',
        description: 'Views division information.',
        permission: LEAGUE_MANAGEMENT,
      },
      {
        name: '/debugdivisions',
        emoji: '🔍',
        description: 'Checks division data for issues.',
        permission: 'See command access rules.',
      },
    ],
  },
];

function createCommandField(command) {
  return {
    name: `${command.emoji}  ${command.name}`,
    value:
      `${command.description}\n\n` +
      `🔑 **Access**\n${command.permission}`,
    inline: true,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View commands and their permissions'),

  async execute(interaction) {
    const embeds = [];

    // Main introduction
    const intro = new EmbedBuilder()
      .setColor(PURPLE)
      .setAuthor({
        name: 'LEAGUE BOT  •  COMMAND CENTER',
      })
      .setTitle('📖 Command Guide')
      .setDescription(
        'Welcome to the league command guide.\n' +
        'Find the command you need using the categories below.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━\n\n' +
        '🏆 **TEAM MANAGEMENT**\n' +
        'Teams, players, and signings.\n\n' +
        '👔 **STAFF MANAGEMENT**\n' +
        'Appointments and staff positions.\n\n' +
        '🏛️ **DIVISION MANAGEMENT**\n' +
        'Divisions and league organization.\n\n' +
        '━━━━━━━━━━━━━━━━━━━━\n\n' +
        '🔑 **Access** indicates which roles can use each command.'
      )
      .setFooter({
        text: 'League Management Bot • Help Menu',
      })
      .setTimestamp();

    embeds.push(intro);

    // Category embeds
    for (const category of commandCategories) {
      const embed = new EmbedBuilder()
        .setColor(PURPLE)
        .setAuthor({
          name: 'LEAGUE BOT  •  COMMAND DIRECTORY',
        })
        .setTitle(category.name)
        .setDescription(
          `${category.description}\n` +
          '━━━━━━━━━━━━━━━━━━━━'
        )
        .addFields(
          category.commands.map(createCommandField)
        )
        .setFooter({
          text: `League Management Bot • ${category.commands.length} commands`,
        });

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
