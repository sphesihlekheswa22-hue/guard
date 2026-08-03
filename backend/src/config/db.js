const mongoose = require("mongoose");
const { ensureLocalSeedData } = require("./seedLocal");

const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGO_URI;

    // Only load mongodb-memory-server for local demos (it's a devDependency and not installed on Render).
    if (process.env.USE_LOCAL_MONGO === "true") {
      const { startLocalMongo } = require("./localMongo");
      mongoUri = await startLocalMongo();
      process.env.MONGO_URI = mongoUri;
    }

    if (!mongoUri) {
      throw new Error("MONGO_URI is required when USE_LOCAL_MONGO is not true");
    }

    // Avoid printing credentials in production logs
    const safeUri = String(mongoUri).replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
    console.log("MONGO_URI:", safeUri);

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
