const mongoose = require("mongoose");

const aiSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: "Report" },
  riskLevel: String,
  insights: String
}, { timestamps: true });

module.exports = mongoose.model("AIAnalysis", aiSchema);