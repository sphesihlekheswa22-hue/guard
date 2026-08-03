const mongoose = require("mongoose");

const ngoOrgSchema = new mongoose.Schema({
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
}, { timestamps: true, collection: "ngo_org" });

ngoOrgSchema.index({ code: 1 }, { unique: true });
ngoOrgSchema.index({ active: 1, name: 1 });

module.exports = mongoose.model("NgoOrg", ngoOrgSchema);
