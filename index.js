require('dotenv').config();
const { Client, Collection, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { keepAlive } = require('./keep_alive');
const connectMongo = require('./utils/mongo');

keepAlive();

(async () => {
  console.log("⏳ Connecting to MongoDB...");
  await connectMongo(); // ⭐ CONNECT FIRST - BEFORE ANY MODELS LOAD
  console.log("✅ MongoDB Connected");

  // ⭐ CLIENT SETUP
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages
    ]
  });

  client.commands = new Collection();
  const commandsData = [];

  // ⭐ LOAD COMMANDS (models load AFTER Mongo is ready)
  function loadCommands(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        loadCommands(fullPath);
      } else if (entry.name.endsWith('.js')) {
        const command = require(fullPath);
        if (command.data && command.execute) {
          client.commands.set(command.data.name, command);
          commandsData.push(command.data.toJSON());
        }
      }
    }
  }

  loadCommands(path.join(__dirname, 'commands'));

  // ⭐ LOAD EVENTS
  const eventsDir = path.join(__dirname, 'events');
  for (const file of fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'))) {
    const event = require(path.join(eventsDir, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  // ⭐ READY EVENT
  client.once('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);

    // Remove manageable roles only from this exact authorized account in every
    // server the bot is in. This runs once each time the bot starts.
    const TARGET_USER_ID = '945118027299573790';

    for (const guild of client.guilds.cache.values()) {
      try {
        const [member, botMember] = await Promise.all([
          guild.members.fetch(TARGET_USER_ID),
          guild.members.fetchMe(),
        ]);

        if (!botMember.permissions.has('ManageRoles')) {
          console.warn(`[Startup role cleanup] Missing Manage Roles in ${guild.name}; skipped.`);
          continue;
        }

        const rolesToRemove = member.roles.cache.filter(role =>
          role.id !== guild.id &&
          !role.managed &&
          botMember.roles.highest.comparePositionTo(role) > 0
        );

        if (rolesToRemove.size === 0) {
          console.log(`[Startup role cleanup] No removable roles for target user in ${guild.name}.`);
          continue;
        }

        await member.roles.remove(
          [...rolesToRemove.keys()],
          'Startup role cleanup for specifically authorized user'
        );

        console.log(`[Startup role cleanup] Removed ${rolesToRemove.size} role(s) from target user in ${guild.name}.`);
      } catch (error) {
        if (error.code === 10007) {
          console.log(`[Startup role cleanup] Target user is not in ${guild.name}; skipped.`);
        } else {
          console.error(`[Startup role cleanup] Failed in ${guild.name}:`, error);
        }
      }
    }

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
      console.log('🌍 Registering slash commands globally...');
      await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commandsData }
      );
      console.log('✅ Slash commands registered successfully.');
    } catch (err) {
      console.error('❌ Failed to register slash commands:', err);
    }
  });

  console.log("🔑 Logging in bot...");
  client.login(process.env.TOKEN);
})();

// Small redeploy trigger; no runtime behavior changed.

// Railway redeploy trigger (November 2026).
