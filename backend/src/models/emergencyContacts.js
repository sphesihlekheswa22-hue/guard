const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, // legacy, keep for compatibility
  fullName: String,
  phone: String,
  relationship: String,
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Email address must be valid."]
  }
});

schema.index({ userId: 1 });
schema.index({ userId: 1, email: 1 });

module.exports = mongoose.model("EmergencyContact", schema);
