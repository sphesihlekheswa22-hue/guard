const mongoose = require("mongoose");

const caseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  policeStationId: String, // Police station that handles this case
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: "Report" },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  caseId: { type: String, unique: true }, // Format: "SOS-XXXXXX" for SOS cases
  type: {
    type: String,
    enum: ["report", "emergency"],
    default: "report"
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium"
  },
  status: {
    type: String,
    enum: ["active", "assigned", "resolved", "closed"],
    default: "active"
  },
  location: {
    type: { type: String, default: "Point" },
    coordinates: [Number], // [longitude, latitude]
    address: String,
    accuracy: Number // GPS accuracy in meters
  },
  notes: String,
  sosTriggeredAt: Date,
  notifiedContacts: [
    {
      contactId: { type: mongoose.Schema.Types.ObjectId, ref: "EmergencyContact" },
      notifiedAt: { type: Date, default: Date.now },
      method: String // "email", "sms", "notification"
    }
  ]
}, { timestamps: true });

caseSchema.index({ location: "2dsphere" });
caseSchema.index({ userId: 1, createdAt: -1 });
caseSchema.index({ policeStationId: 1, status: 1, createdAt: -1 });
caseSchema.index({ reportId: 1 });

module.exports = mongoose.model("Case", caseSchema);
