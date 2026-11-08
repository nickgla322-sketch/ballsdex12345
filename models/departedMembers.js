const mongoose = require('mongoose');

const departedMembershipSchema = new mongoose.Schema({
  teamRoleId: { type: String, required: true },
  teamName: { type: String, default: 'Unknown Team' },
  staffRoleId: { type: String, default: null },
  position: { type: String, default: null },
}, { _id: false });

const departedMemberSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  memberships: { type: [departedMembershipSchema], default: [] },
  departedAt: { type: Date, default: Date.now },
});

departedMemberSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('DepartedMember', departedMemberSchema);
