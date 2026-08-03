const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  code: String,
  name: String
});

module.exports = mongoose.model("Language", schema);