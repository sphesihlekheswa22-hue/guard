const mongoose = require("mongoose");

const adminProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  fullName: String,
  email: { type: String, trim: true, lowercase: true },
  phone: String,
  address: { type: String, trim: true },
  idNumber: { type: String, trim: true },
  gender: String,
  role: { type: String, default: "admin" },
  emergencyContacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "EmergencyContact" }]
}, { timestamps: true });

module.exports = mongoose.model("AdminProfile", adminProfileSchema, "admins");
