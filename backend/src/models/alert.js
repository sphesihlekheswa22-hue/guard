const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: "Case" },
  policeStationId: String,
  location: {
    type: { type: String, default: "Point" },
    coordinates: [Number],
    address: String,
    accuracy: Number
  },
  type: {
    type: String,
    enum: ["sos", "general"],
    default: "sos"
  },
  status: {
    type: String,
    enum: ["active", "call initiated", "acknowledged", "resolved"],
    default: "active"
  },
  acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  acknowledgedAt: Date,
  resolvedAt: Date
}, { timestamps: true });

alertSchema.index({ location: "2dsphere" });
alertSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ policeStationId: 1, status: 1, createdAt: -1 });
alertSchema.index({ caseId: 1 });

module.exports = mongoose.model("Alert", alertSchema);
