const mongoose = require("mongoose");
const { USER_ROLES } = require("../constants/roles");

const userSchema = new mongoose.Schema({
  fullName: String,
  email: {
    type: String,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Email address must be valid."]
  },
  password: String,
  phone: String,
  address: {
    type: String,
    trim: true
  },
  idNumber: {
    type: String,
    trim: true,
    match: [/^$|^\d{13}$/, "ID number must be 13 digits."]
  },
  gender: {
    type: String,
    enum: ["", "female", "male", "other", "prefer_not_to_say"],
    default: ""
  },
  role: {
    type: String,
    enum: USER_ROLES,
    default: "reporter"
  },
  policeStationId: String,
  policeStationName: String,
  ngoId: String,
  ngoName: String,
  preferredNgoId: String,
  preferredNgoName: String,
  emergencyContacts: [
    { type: mongoose.Schema.Types.ObjectId, ref: "EmergencyContact" }
  ],
  preferredLanguage: String,
  isVerified: { type: Boolean, default: false },
  accountDeletionStatus: {
    type: String,
    enum: ["none", "scheduled"],
    default: "none"
  },
  accountDeletionRequestedAt: Date,
  resetPasswordToken: String, // SHA-256 hash of the one-time reset token
  resetPasswordExpires: Date   // Expires in 5 minutes for security
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
