const mongoose = require("mongoose");

const evidenceSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: "Report" },
  fileUrl: String,
  name: String,
  type: String
}, { timestamps: true });

evidenceSchema.index({ reportId: 1 });

module.exports = mongoose.model("Evidence", evidenceSchema);
