const ALLOWED_ROLE_IDS = [
  '1561183666976202832',
  '1374495087509114901',
  '1374495092521566260',
  '1374495097961578656',
  '1374495103049269298',
];

async function hasModPermission(interaction) {
  if (!interaction.guild) return false;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return Boolean(member && member.roles.cache.some(role => ALLOWED_ROLE_IDS.includes(role.id)));
}

module.exports = { ALLOWED_ROLE_IDS, hasModPermission };
