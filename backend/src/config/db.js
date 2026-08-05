const prisma = require("./prisma");
const { ensureSeedData } = require("./seed");
const { unifySoshanguveStationIds } = require("../services/stationScopeService");

const connectDB = async () => {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required (PostgreSQL connection string)");
    }

    await prisma.$connect();
    console.log("PostgreSQL Connected via Prisma");

    await ensureSeedData();
    // Fix officers who have "SAPS Soshanguve" by name but a different station id than reports
    await unifySoshanguveStationIds();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

module.exports = connectDB;
