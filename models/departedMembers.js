const mongoose = require('mongoose');

const departedMemberSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  memberships: [{
    teamName: String,
    teamRoleId: String,
    staffRoleId: String,
    position: String
  }]
}, { timestamps: true });

departedMemberSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('DepartedMember', departedMemberSchema);
