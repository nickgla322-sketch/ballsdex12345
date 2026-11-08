const DepartedMembers = require('../models/departedMembers');
const Teams = require('../models/teams');
const Staffs = require('../models/staffs');

function getStaffRoleId(position) {
  switch (position) {
    case 'assistant': return '1374495166651437169';
    case 'manager': return '1374495160632610918';
    case 'chairman': return '1374495155310297099';
    default: return null;
  }
}

module.exports = {
  name: 'guildMemberAdd',

  async execute(member) {
    try {
      const departed = await DepartedMembers.findOne({
        guildId: member.guild.id,
        userId: member.id,
      });

      if (!departed || !departed.memberships?.length) return;

      const teamRoleIds = departed.memberships.map(entry => entry.teamRoleId);
      const [teams, staffEntries] = await Promise.all([
        Teams.find({ roleId: { $in: teamRoleIds } }),
        Staffs.find({ userId: member.id, teamRoleId: { $in: teamRoleIds } }),
      ]);

      const teamsByRole = new Map(teams.map(team => [team.roleId, team]));
      const staffByTeam = new Map(staffEntries.map(entry => [entry.teamRoleId, entry]));
      let restoreSucceeded = true;

      for (const saved of departed.memberships) {
        const team = teamsByRole.get(saved.teamRoleId);

        // Do not restore roles for teams that have since been removed.
        if (!team) continue;

        try {
          if (!member.roles.cache.has(team.roleId)) {
            await member.roles.add(team.roleId, 'Restoring saved team membership after rejoining');
          }

          // Restore a staff role only when the current staff record still exists.
          const currentStaff = staffByTeam.get(team.roleId);
          if (currentStaff) {
            const staffRoleId = getStaffRoleId(currentStaff.position);
            if (staffRoleId && !member.roles.cache.has(staffRoleId)) {
              await member.roles.add(staffRoleId, 'Restoring saved team staff position after rejoining');
            }
          }
        } catch (error) {
          restoreSucceeded = false;
          console.error(`Failed to restore team roles for ${member.id} in ${team.name}:`, error);
        }
      }

      // Only clear the saved record after every attempted role restore succeeds.
      if (restoreSucceeded) {
        await DepartedMembers.deleteOne({
          guildId: member.guild.id,
          userId: member.id,
        });
      }
    } catch (error) {
      console.error('Error restoring departed team member roles:', error);
    }
  },
};
