const DepartedMembers = require('../models/departedMembers');

module.exports = {
  name: 'guildMemberAdd',

  async execute(member) {
    try {
      const departed = await DepartedMembers.findOne({
        guildId: member.guild.id,
        userId: member.id,
      });

      if (!departed || !departed.memberships?.length) return;

      // Restore only the saved team role and the matching staff-position role.
      const roleIds = new Set();

      const Staffs = require('../models/staffs');
      const Teams = require('../models/teams');
      const [currentStaffEntries, currentTeams] = await Promise.all([
        Staffs.find({ userId: member.id }),
        Teams.find(),
      ]);

      const currentStaffByTeam = new Map(
        currentStaffEntries.map(entry => [entry.teamRoleId, entry])
      );
      const validTeamRoleIds = new Set(currentTeams.map(team => team.roleId));

      for (const membership of departed.memberships) {
        // Do not restore a team that has since been removed from the database.
        if (membership.teamRoleId && validTeamRoleIds.has(membership.teamRoleId)) {
          roleIds.add(membership.teamRoleId);
        }

        // Restore a staff role only if the database still confirms that
        // exact staff position. This prevents stale promotions/positions
        // from being restored after a demotion or sack while absent.
        const currentStaff = currentStaffByTeam.get(membership.teamRoleId);
        if (
          currentStaff &&
          currentStaff.position === membership.position &&
          membership.staffRoleId
        ) {
          roleIds.add(membership.staffRoleId);
        }
      }

      const validRoleIds = [...roleIds].filter(roleId =>
        member.guild.roles.cache.has(roleId)
      );

      for (const roleId of validRoleIds) {
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(
            roleId,
            'Restoring team membership after rejoining the server'
          );
        }
      }

      // Keep the saved record if a role could not be restored, allowing a retry.
      await DepartedMembers.deleteOne({
        _id: departed._id,
      });

      console.log(
        `Restored ${validRoleIds.length} team role(s) for rejoining member ${member.user.tag}.`
      );
    } catch (error) {
      console.error('Failed to restore team roles for rejoining member:', error);
    }
  },
};
