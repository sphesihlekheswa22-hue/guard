const mongoose = require("mongoose");
const { startLocalMongo } = require("./localMongo");
const { ensureLocalSeedData } = require("./seedLocal");

const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGO_URI;

    if (process.env.USE_LOCAL_MONGO === "true") {
      mongoUri = await startLocalMongo();
      process.env.MONGO_URI = mongoUri;
    }

    console.log("MONGO_URI:", mongoUri);

    const conn = await mongoose.connect(mongoUri, {
      dbName: "gbvDatabase",
    });

    console.log("MongoDB Connected");
    console.log("Connected to DB:", conn.connection.name);
    console.log("MongoDB host:", conn.connection.host);

    await ensureLocalSeedData();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

module.exports = connectDB;
