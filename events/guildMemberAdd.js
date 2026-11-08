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

      for (const membership of departed.memberships) {
        if (membership.teamRoleId) {
          roleIds.add(membership.teamRoleId);
        }

        if (membership.staffRoleId) {
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
