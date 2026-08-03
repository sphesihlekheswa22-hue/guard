/**
 * Seeds Soshanguve police station + sample NGOs for local testing.
 * Run: node scripts/seedLocal.js
 */
require("dotenv").config();
require("dotenv").config({ path: "./src/.env" });

const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const PoliceStation = require("../src/models/policeStation");
const NgoOrg = require("../src/models/ngoOrg");
const User = require("../src/models/users");
const bcrypt = require("bcryptjs");
const { stopLocalMongo } = require("../src/config/localMongo");

async function seed() {
  await connectDB();

  const station = await PoliceStation.findOneAndUpdate(
    { code: "soshanguve-0152" },
    {
      name: "SAPS Soshanguve Police Station",
      code: "soshanguve-0152",
      phone: "012 730 1300",
      email: "soshanguve@saps.local",
      address: "2091 Commissioner St, Soshanguve - H, Soshanguve, 0152",
      active: true,
    },
    { upsert: true, new: true }
  );

  const ngoHope = await NgoOrg.findOneAndUpdate(
    { code: "hope-warriors" },
    {
      name: "Hope Warriors",
      code: "hope-warriors",
      phone: "012 943 7265",
      email: "director@hopewarriors.local",
      address: "459/19 Thwalo Street B1, Block, Soshanguve - XX, Soshanguve, 0152",
      active: true,
    },
    { upsert: true, new: true }
  );

  const ngoSavwa = await NgoOrg.findOneAndUpdate(
    { code: "savwa" },
    {
      name: "South Africa Volunteer Work Camp Association (SAVWA)",
      code: "savwa",
      phone: "073 241 1341",
      email: "info@savwa.local",
      address: "Phase 3, Tshego street Block, 277, Soshanguve - NN, Soshanguve, 0152",
      active: true,
    },
    { upsert: true, new: true }
  );

  const adminEmail = String(process.env.ADMIN_EMAILS || "admin@safeguard.com")
    .split(",")[0]
    .trim()
    .toLowerCase();

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      fullName: "SafeGuard Admin",
      email: adminEmail,
      password: await bcrypt.hash("Admin123!", 10),
      role: "admin",
    });
  }

  console.log("✅ Seed complete");
  console.log("Police station:", station.name, station._id.toString());
  console.log("NGO:", ngoHope.name, ngoHope._id.toString());
  console.log("NGO:", ngoSavwa.name, ngoSavwa._id.toString());
  console.log("Admin login:", adminEmail, "/ Admin123!");

  await mongoose.disconnect();
  await stopLocalMongo();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
    await stopLocalMongo();
  } catch (_) {}
  process.exit(1);
});
