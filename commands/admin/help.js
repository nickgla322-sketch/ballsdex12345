
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { logAction } = require('../../utils/logger');

const PURPLE = '#9b59b6';

const tutorialSections = [
  {
    title: 'Signing Players',
    description:
      '**Command:** `/sign`\n' +
      '**Where:** #「💬」▏general\n\n' +
      '**How to use it:**\n' +
      '1. Type `/sign`.\n' +
      '2. Select the `player` option.\n' +
      '3. Choose the player and submit.\n\n' +
      '**What it does:** Adds the player to your club, gives them your team role, and removes their Free Agent role if they have one. The player also receives a DM with a button to report a forced signing.\n\n' +
      '**Who can use it:** Chairmen, Managers, and Assistant Managers.',
  },
  {
    title: 'Releasing Players',
    description:
      '**Command:** `/release`\n' +
      '**Where:** #「💬」▏general\n\n' +
      '**How to use it:**\n' +
      '1. Type `/release`.\n' +
      '2. Select the `player` option.\n' +
      '3. Choose the player and submit.\n\n' +
      '**What it does:** Removes the player’s team role and gives them the Free Agent role.\n\n' +
      '**Who can use it:** Chairmen, Managers, and Assistant Managers.\n\n' +
      '**Limit:** Releasing 5 different players within 5 minutes triggers a 6-hour cooldown. Staff must demote a player before releasing them.',
  },
  {
    title: 'Promoting Players',
    description:
      '**Command:** `/promote`\n' +
      '**Where:** #「💬」▏general\n\n' +
      '**How to use it:**\n' +
      '1. Type `/promote`.\n' +
      '2. Select the `user` option.\n' +
      '3. Select the `to` option: Assistant Manager or Manager.\n' +
      '4. Submit the command.\n\n' +
      '**What it does:** Gives the player the selected staff role and saves their new position.\n\n' +
      '**Permissions:**\n' +
      '• Chairmen can promote to Manager or Assistant Manager.\n' +
      '• Managers can promote to Assistant Manager.\n' +
      '• Assistant Managers cannot promote.\n\n' +
      'The player must be on your team. Each team can only have one person in each staff position.',
  },
  {
    title: 'Demoting Staff',
    description:
      '**Command:** `/demote`\n' +
      '**Where:** #「💬」▏general\n\n' +
      '**How to use it:**\n' +
      '1. Type `/demote`.\n' +
      '2. Select the `user` option.\n' +
      '3. Select the `to` option: Manager, Assistant Manager, or Normal Team Member.\n' +
      '4. Submit the command.\n\n' +
      '**What it does:** Removes the old staff role and applies the new position. Choosing Normal Team Member removes their staff record but keeps their team role.\n\n' +
      '**Permissions:**\n' +
      '• Chairmen can demote Managers and Assistant Managers.\n' +
      '• Managers can demote Assistant Managers.\n' +
      '• Assistant Managers cannot demote.\n\n' +
      'You cannot demote someone equal to or above your own rank.',
  },
  {
    title: 'If the Bot Is Down',
    description:
      'If the GFC Bot is offline or a command is not working, post in #「💳」▏transactions.\n\n' +
      'Include:\n' +
      '• Player username\n' +
      '• Club name\n' +
      '• Action: Signing, Release, Promotion, or Demotion\n' +
      '• New position, if applicable\n\n' +
      '**Example:**\n' +
      '`Player: Username`\n' +
      '`Club: Club Name`\n' +
      '`Action: Promotion`\n' +
      '`Position: Assistant Manager`',
  },
  {
    title: 'Rules and Logs',
    description:
      '• Only sign players who agree to join your club.\n' +
      '• Forced signings can result in the responsible staff member being sacked.\n' +
      '• Signings, releases, promotions, and demotions are logged.\n' +
      '• Deleting a transaction message does not necessarily delete the bot’s console logs.\n' +
      '• Use commands responsibly and check the selected player before submitting.',
  },
];

function createTutorialEmbed(section, index) {
  return new EmbedBuilder()
    .setColor(PURPLE)
    .setTitle(section.title)
    .setDescription(section.description)
    .setFooter({
      text: `GFC Bot Tutorial • Section ${index + 1} of ${tutorialSections.length}`,
    });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View the GFC Bot tutorial.'),

  async execute(interaction) {
    const introEmbed = new EmbedBuilder()
      .setColor(PURPLE)
      .setTitle('GFC Bot Tutorial')
      .setDescription(
        'Learn how to manage players and club staff using the GFC Bot.\n\n' +
        '**Available guides**\n' +
        'Signing Players\n' +
        'Releasing Players\n' +
        'Promoting Players\n' +
        'Demoting Staff\n' +
        'Bot Issues and Transactions\n' +
        'Rules and Logs'
      )
      .setFooter({
        text: 'Use the sections below as a reference.',
      });

    const embeds = [
      introEmbed,
      ...tutorialSections.map(createTutorialEmbed),
    ];

    await interaction.reply({
      embeds,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });

    await logAction(
      interaction.guild,
      'Help Command',
      `${interaction.user.tag} viewed the GFC Bot tutorial.`
    );
  },
};
