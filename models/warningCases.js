const mongoose = require('mongoose');

const warningCaseSchema = new mongoose.Schema({
  caseId: { type: Number, required: true, unique: true, index: true },
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  moderatorId: { type: String, required: true },
  offense: { type: String, required: true },
  pointsAdded: { type: Number, required: true },
  totalPointsAfter: { type: Number, required: true },
  moderatorMessage: { type: String, required: true },
  proofUrl: { type: String, default: null },
  proofName: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('WarningCase', warningCaseSchema);
