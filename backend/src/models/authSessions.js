const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  token: String,
  expiresAt: Date
});

schema.index({ userId: 1 });
schema.index({ expiresAt: 1 });

module.exports = mongoose.model("AuthSession", schema);
