const mongoose = require("mongoose");

const policeStationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  address: { type: String, trim: true },
  active: { type: Boolean, default: true }
}, { timestamps: true, collection: "police_stations" });

policeStationSchema.index({ code: 1 }, { unique: true });
policeStationSchema.index({ active: 1, name: 1 });

module.exports = mongoose.model("PoliceStation", policeStationSchema);
