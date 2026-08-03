let mongod;

/**
 * Starts an embedded in-memory MongoDB on this machine (no Atlas / no Docker).
 * Data resets when the backend process stops — good for local testing only.
 * Required package is a devDependency and must not load on Render.
 */
async function startLocalMongo() {
  const { MongoMemoryServer } = require("mongodb-memory-server");

  mongod = await MongoMemoryServer.create({
    instance: {
      dbName: "gbvDatabase",
    },
  });

  const uri = mongod.getUri("gbvDatabase");
  console.log("📦 Local in-memory MongoDB started");
  console.log("📦 Local Mongo URI:", uri);
  return uri;
}

async function stopLocalMongo() {
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

module.exports = { startLocalMongo, stopLocalMongo };
