const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  key: String,
  value: String
});

module.exports = mongoose.model("SystemSetting", schema);