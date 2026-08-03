const prisma = require("./prisma");
const { ensureSeedData } = require("./seed");

const connectDB = async () => {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required (PostgreSQL connection string)");
    }

    await prisma.$connect();
    console.log("PostgreSQL Connected via Prisma");

    await ensureSeedData();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

module.exports = connectDB;
