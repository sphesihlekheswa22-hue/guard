const mongoose = require("mongoose");

const ngoProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  fullName: String,
  email: { type: String, trim: true, lowercase: true },
  phone: String,
  address: { type: String, trim: true },
  idNumber: { type: String, trim: true },
  gender: String,
  role: { type: String, enum: ["ngo", "ngo_worker"], default: "ngo_worker" },
  ngoId: String,
  ngoName: String,
  emergencyContacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "EmergencyContact" }]
}, { timestamps: true });

module.exports = mongoose.model("NgoProfile", ngoProfileSchema, "ngos");
