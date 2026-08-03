const mongoose = require("mongoose");

const hotspotSchema = new mongoose.Schema({
  location: {
    type: { type: String, default: "Point" },
    coordinates: [Number]
  },
  incidentCount: Number
});

hotspotSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Hotspot", hotspotSchema);