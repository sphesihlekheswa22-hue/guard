const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  location: {
    type: { type: String, default: "Point" },
    coordinates: [Number]
  },
  updatedAt: Date
});

schema.index({ location: "2dsphere" });

module.exports = mongoose.model("LiveLocation", schema);