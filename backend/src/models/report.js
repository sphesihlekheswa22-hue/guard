const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  caseId: { type: String, unique: true, sparse: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  policeStationId: String,
  preferredNgoId: String,
  referredNgoId: String,
  referredNgoName: String,
  clientRequestId: { type: String, trim: true },
  description: String,
  incidentType: String,
  evidenceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Evidence" }],
  location: {
    type: { type: String, default: "Point" },
    coordinates: [Number],
    address: String,
    accuracy: Number
  },
  status: {
    type: String,
    enum: ["pending", "investigating", "referred_to_ngo", "call_initiated", "arranged_counselling", "resolved"],
    default: "pending"
  },
  statusHistory: {
    type: [{
      status: String,
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      changedByRole: String,
      changedAt: { type: Date, default: Date.now },
      reason: String
    }],
    default: []
  },
  interactions: [{
    type: { type: String, enum: ["call", "note", "concern", "outcome"] },
    description: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

reportSchema.index(
  { userId: 1, clientRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientRequestId: { $type: "string" } }
  }
);
reportSchema.index({ userId: 1, createdAt: -1 });
reportSchema.index({ policeStationId: 1, createdAt: -1 });
reportSchema.index({ policeStationId: 1, status: 1, createdAt: -1 });
reportSchema.index({ referredNgoId: 1, status: 1, createdAt: -1 });
reportSchema.index({ preferredNgoId: 1, status: 1, createdAt: -1 });
reportSchema.index({ "statusHistory.status": 1, referredNgoId: 1 });

module.exports = mongoose.model("Report", reportSchema);
