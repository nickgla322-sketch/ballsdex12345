const commands = {
  purge: require('./purge'),
  viewpoints: require('./viewpoints'),
  editpoints: require('./editpoints'),
  viewwarn: require('./viewwarn'),
  warn: require('./warn'),
};

const subcommands = Object.entries(commands).map(([name, command]) => ({
  type: 1,
  name,
  description: command.data.description,
  options: command.data.toJSON().options || [],
}));

module.exports = {
  data: {
    name: 'mod',
    description: 'League moderation commands.',
    options: subcommands,
    toJSON() {
      return {
        name: this.name,
        description: this.description,
        options: this.options,
      };
    },
  },

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    const command = commands[subcommand];
    if (!command) {
      return interaction.reply({
        content: 'Unknown moderation command.',
        ephemeral: true,
      });
    }
    return command.execute(interaction, client);
  },
};
