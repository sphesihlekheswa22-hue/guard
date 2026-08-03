const mongoose = require("mongoose");

const trackingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isActive: Boolean,
  startedAt: Date,
  endedAt: Date
});

module.exports = mongoose.model("TrackingSession", trackingSchema);