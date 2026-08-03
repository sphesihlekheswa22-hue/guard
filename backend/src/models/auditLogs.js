const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  actorName: String,
  actorEmail: String,
  actorRole: String,
  action: String,
  resourceType: String,
  resourceId: String,
  resourceLabel: String,
  details: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model("AuditLog", schema); 
