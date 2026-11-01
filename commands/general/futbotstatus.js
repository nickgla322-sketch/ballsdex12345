const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const futbotApi = require('../../utils/futbotApi');

module.exports = {
  data: null,

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const response = await futbotApi.getStatus();
      const status = response.data;

      const enabledFeatures = Object.entries(status.features || {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name.replace(/_/g, ' '));

      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('FutBot API Connection')
        .setDescription('The Discord bot successfully reached the Python API.')
        .addFields(
          { name: 'Service', value: status.service || 'Unknown', inline: true },
          { name: 'API Version', value: String(status.api_version ?? 'Unknown'), inline: true },
          { name: 'Database', value: status.database || 'Unknown', inline: true },
          {
            name: 'Available Features',
            value: enabledFeatures.length
              ? enabledFeatures.map(feature => `• ${feature}`).join('\n').slice(0, 1024)
              : 'No features were reported.',
          },
        )
        .setFooter({ text: 'FutBot API • Connection test' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('FutBot API connection check failed:', error);

      return interaction.editReply({
        content: `Could not connect to the FutBot API: ${error.message}`,
      });
    }
  },
};
