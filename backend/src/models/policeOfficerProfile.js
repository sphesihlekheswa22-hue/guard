const mongoose = require("mongoose");

const policeOfficerProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  fullName: String,
  email: { type: String, trim: true, lowercase: true },
  phone: String,
  address: { type: String, trim: true },
  idNumber: { type: String, trim: true },
  gender: String,
  role: { type: String, enum: ["authority", "officer"], default: "officer" },
  policeStationId: String,
  policeStationName: String,
  emergencyContacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "EmergencyContact" }]
}, { timestamps: true });

module.exports = mongoose.model("PoliceOfficerProfile", policeOfficerProfileSchema, "police_officers");
