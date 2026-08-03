const PoliceStation = require("../models/policeStation");
const NgoOrg = require("../models/ngoOrg");
const User = require("../models/users");
const Report = require("../models/report");
const Case = require("../models/case");
const Alert = require("../models/alert");
const EmergencyContact = require("../models/emergencyContacts");
const Notification = require("../models/notifications");
const bcrypt = require("bcryptjs");
const { syncRoleProfile } = require("../services/roleProfileService");

const DEMO_PASSWORD = "DemoPass123!";
const ADMIN_PASSWORD = "Admin123!";

const SOSHANGUVE_POINTS = [
  {
    address: "2091 Commissioner St, Soshanguve - H, Soshanguve, 0152",
    coordinates: [28.1075, -25.5228],
  },
  {
    address: "Soshanguve Plaza, Block H, Soshanguve, 0152",
    coordinates: [28.1121, -25.5274],
  },
  {
    address: "Tshego Street, Soshanguve - NN, Soshanguve, 0152",
    coordinates: [28.0988, -25.5351],
  },
  {
    address: "Aubrey Matlala St, Soshanguve, 0152",
    coordinates: [28.1194, -25.5182],
  },
];

async function upsertUser(payload, password = DEMO_PASSWORD) {
  let user = await User.findOne({ email: payload.email });
  if (user) {
    Object.assign(user, payload);
    await user.save();
  } else {
    user = await User.create({
      ...payload,
      password: await bcrypt.hash(password, 10),
      isVerified: true,
    });
  }
  await syncRoleProfile(user);
  return user;
}

async function ensureContactsForReporter(reporter) {
  if (Array.isArray(reporter.emergencyContacts) && reporter.emergencyContacts.length > 0) {
    return EmergencyContact.find({ userId: reporter._id });
  }

  const contacts = await EmergencyContact.insertMany([
    {
      userId: reporter._id,
      fullName: "Thandi Molefe",
      name: "Thandi Molefe",
      relationship: "Sister",
      phone: "0823456789",
      email: "thandi.molefe@example.com",
    },
    {
      userId: reporter._id,
      fullName: "Sipho Dlamini",
      name: "Sipho Dlamini",
      relationship: "Friend",
      phone: "0734567890",
      email: "sipho.dlamini@example.com",
    },
  ]);

  reporter.emergencyContacts = contacts.map((contact) => contact._id);
  await reporter.save();
  return contacts;
}

async function seedOperationalData({ station, hope, savwa, admin, reporter, reporter2, officer, ngoWorker }) {
  const alreadySeeded = await Report.exists({ clientRequestId: "seed-report-1" });
  if (alreadySeeded) {
    console.log("   Operational demo cases already present — skipping recreate");
    return;
  }

  const stationId = station._id.toString();
  const hopeId = hope._id.toString();
  const savwaId = savwa._id.toString();
  const loc = (index) => SOSHANGUVE_POINTS[index % SOSHANGUVE_POINTS.length];

  const reportDefs = [
    {
      clientRequestId: "seed-report-1",
      caseId: "GBV-20260803-1001",
      user: reporter,
      incidentType: "Domestic Violence",
      description:
        "Reporter was assaulted by an intimate partner at home in Soshanguve Block H. Neighbours heard shouting and called for help.",
      status: "pending",
      point: loc(0),
      daysAgo: 1,
    },
    {
      clientRequestId: "seed-report-2",
      caseId: "GBV-20260803-1002",
      user: reporter,
      incidentType: "Harassment",
      description:
        "Ongoing harassment near Soshanguve Plaza. Suspect followed the reporter and sent threatening messages.",
      status: "investigating",
      point: loc(1),
      daysAgo: 3,
      historyExtra: [{ status: "investigating", reason: "Officer assigned for investigation" }],
    },
    {
      clientRequestId: "seed-report-3",
      caseId: "GBV-20260803-1003",
      user: reporter,
      incidentType: "Stalking",
      description:
        "Unknown person has been stalking the reporter around Tshego Street for two weeks.",
      status: "referred_to_ngo",
      point: loc(2),
      daysAgo: 5,
      referredNgoId: hopeId,
      referredNgoName: "Hope Warriors",
      historyExtra: [
        { status: "investigating", reason: "Case opened by SAPS Soshanguve" },
        { status: "referred_to_ngo", reason: "Referred to Hope Warriors for counselling support" },
      ],
      interactions: [
        {
          type: "note",
          description: "Survivor agreed to NGO counselling referral.",
          createdBy: officer._id,
        },
        {
          type: "call",
          description: "NGO worker called survivor and scheduled intake session.",
          createdBy: ngoWorker._id,
        },
      ],
    },
    {
      clientRequestId: "seed-report-4",
      caseId: "GBV-20260803-1004",
      user: reporter2,
      incidentType: "Sexual Assault",
      description:
        "Sexual assault reported near Aubrey Matlala Street. Medical and psychosocial support requested.",
      status: "arranged_counselling",
      point: loc(3),
      daysAgo: 7,
      referredNgoId: hopeId,
      referredNgoName: "Hope Warriors",
      historyExtra: [
        { status: "investigating", reason: "Statement taken at SAPS Soshanguve" },
        { status: "referred_to_ngo", reason: "Urgent NGO referral" },
        { status: "arranged_counselling", reason: "Counselling session booked" },
      ],
      interactions: [
        {
          type: "outcome",
          description: "Initial counselling arranged for Friday 10:00.",
          createdBy: ngoWorker._id,
        },
      ],
    },
    {
      clientRequestId: "seed-report-5",
      caseId: "GBV-20260803-1005",
      user: reporter2,
      incidentType: "Online / Cyber Abuse",
      description:
        "Ex-partner shared private images online and threatened further exposure.",
      status: "resolved",
      point: loc(0),
      daysAgo: 12,
      referredNgoId: savwaId,
      referredNgoName: "South Africa Volunteer Work Camp Association (SAVWA)",
      historyExtra: [
        { status: "investigating", reason: "Digital evidence collected" },
        { status: "referred_to_ngo", reason: "Support referral completed" },
        { status: "resolved", reason: "Case closed after support and protection steps" },
      ],
    },
    {
      clientRequestId: "seed-report-6",
      caseId: "GBV-20260803-1006",
      user: reporter,
      incidentType: "Forced Marriage",
      description:
        "Family pressure to enter forced marriage. Reporter requested confidential support and police protection advice.",
      status: "pending",
      point: loc(1),
      daysAgo: 0,
    },
  ];

  for (const def of reportDefs) {
    const createdAt = new Date(Date.now() - def.daysAgo * 24 * 60 * 60 * 1000);
    const statusHistory = [
      {
        status: "pending",
        changedBy: def.user._id,
        changedByRole: "reporter",
        changedAt: createdAt,
        reason: "Report created",
      },
      ...(def.historyExtra || []).map((item, index) => ({
        status: item.status,
        changedBy: item.status === "referred_to_ngo" || item.status === "arranged_counselling" ? ngoWorker._id : officer._id,
        changedByRole:
          item.status === "referred_to_ngo" || item.status === "arranged_counselling"
            ? "ngo_worker"
            : "officer",
        changedAt: new Date(createdAt.getTime() + (index + 1) * 60 * 60 * 1000),
        reason: item.reason,
      })),
    ];

    await Report.create({
      caseId: def.caseId,
      clientRequestId: def.clientRequestId,
      userId: def.user._id,
      policeStationId: stationId,
      preferredNgoId: hopeId,
      referredNgoId: def.referredNgoId || null,
      referredNgoName: def.referredNgoName || null,
      description: def.description,
      incidentType: def.incidentType,
      location: {
        type: "Point",
        coordinates: def.point.coordinates,
        address: def.point.address,
        accuracy: 12,
      },
      status: def.status,
      statusHistory,
      interactions: (def.interactions || []).map((item) => ({
        ...item,
        createdAt: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000),
      })),
      createdAt,
      updatedAt: createdAt,
    });
  }

  const contacts = await EmergencyContact.find({ userId: reporter._id });
  const sosLoc = loc(2);
  const sosCase = await Case.create({
    userId: reporter._id,
    policeStationId: stationId,
    caseId: "SOS-A1B2C3",
    type: "emergency",
    priority: "critical",
    status: "active",
    location: {
      type: "Point",
      coordinates: sosLoc.coordinates,
      address: sosLoc.address,
      accuracy: 8,
    },
    sosTriggeredAt: new Date(Date.now() - 45 * 60 * 1000),
    assignedTo: officer._id,
    notes: "Live SOS triggered near Tshego Street. Officer dispatched.",
    notifiedContacts: contacts.map((contact) => ({
      contactId: contact._id,
      notifiedAt: new Date(),
      method: "email",
    })),
  });

  await Alert.create({
    userId: reporter._id,
    caseId: sosCase._id,
    policeStationId: stationId,
    type: "sos",
    status: "active",
    location: {
      type: "Point",
      coordinates: sosLoc.coordinates,
      address: sosLoc.address,
      accuracy: 8,
    },
  });

  const resolvedSosLoc = loc(0);
  const resolvedSos = await Case.create({
    userId: reporter2._id,
    policeStationId: stationId,
    caseId: "SOS-D4E5F6",
    type: "emergency",
    priority: "critical",
    status: "resolved",
    location: {
      type: "Point",
      coordinates: resolvedSosLoc.coordinates,
      address: resolvedSosLoc.address,
      accuracy: 10,
    },
    sosTriggeredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    assignedTo: officer._id,
    notes: "SOS resolved after police response and family safety check.",
  });

  await Alert.create({
    userId: reporter2._id,
    caseId: resolvedSos._id,
    policeStationId: stationId,
    type: "sos",
    status: "resolved",
    acknowledgedBy: officer._id,
    acknowledgedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000),
    resolvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000),
    location: {
      type: "Point",
      coordinates: resolvedSosLoc.coordinates,
      address: resolvedSosLoc.address,
      accuracy: 10,
    },
  });

  await Notification.insertMany([
    {
      userId: reporter._id,
      message: "Your report GBV-20260803-1002 is now under investigation by SAPS Soshanguve.",
      read: false,
    },
    {
      userId: reporter._id,
      message: "Your report GBV-20260803-1003 was referred to Hope Warriors.",
      read: false,
    },
    {
      userId: officer._id,
      message: "New SOS alert SOS-A1B2C3 requires immediate response in Soshanguve.",
      read: false,
    },
    {
      userId: ngoWorker._id,
      message: "New referral GBV-20260803-1003 assigned to Hope Warriors.",
      read: false,
    },
    {
      userId: admin._id,
      message: "Daily summary: 6 demo reports and 2 SOS cases are loaded for Soshanguve.",
      read: true,
    },
  ]);

  console.log("   Reports: 6 demo GBV cases across pending/investigating/referred/resolved");
  console.log("   SOS: SOS-A1B2C3 (active), SOS-D4E5F6 (resolved)");
  console.log("   Notifications seeded for reporter/officer/NGO/admin");
}

/**
 * Full demo dataset for SafeGuard (Soshanguve only).
 * Runs for local memory Mongo, or on Render/Atlas when SEED_IF_EMPTY=true and DB has no users.
 */
async function ensureLocalSeedData() {
  const allowLocal = process.env.USE_LOCAL_MONGO === "true";
  const allowEmptySeed = process.env.SEED_IF_EMPTY === "true";

  if (!allowLocal && !allowEmptySeed) return;

  if (allowEmptySeed && !allowLocal) {
    const User = require("../models/users");
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      console.log("🌱 SEED_IF_EMPTY skipped — users already exist");
      return;
    }
    console.log("🌱 SEED_IF_EMPTY: empty database detected, seeding demo data...");
  }

  const station = await PoliceStation.findOneAndUpdate(
    { code: "soshanguve-0152" },
    {
      name: "SAPS Soshanguve Police Station",
      code: "soshanguve-0152",
      phone: "012 730 1300",
      email: "thinesamuel@saps.gov.za",
      address: "2091 Commissioner St, Soshanguve - H, Soshanguve, 0152",
      active: true,
    },
    { upsert: true, returnDocument: "after" }
  );

  const hope = await NgoOrg.findOneAndUpdate(
    { code: "hope-warriors" },
    {
      name: "Hope Warriors",
      code: "hope-warriors",
      phone: "012 943 7265",
      email: "director@hopewarriorscharity.org.za",
      address: "459/19 Thwalo Street B1, Block, Soshanguve - XX, Soshanguve, 0152",
      active: true,
    },
    { upsert: true, returnDocument: "after" }
  );

  const savwa = await NgoOrg.findOneAndUpdate(
    { code: "savwa" },
    {
      name: "South Africa Volunteer Work Camp Association (SAVWA)",
      code: "savwa",
      phone: "073 241 1341",
      email: "info@powa.co.za",
      address: "Phase 3, Tshego street Block, 277, Soshanguve - NN, Soshanguve, 0152",
      active: true,
    },
    { upsert: true, returnDocument: "after" }
  );

  const adminEmail = String(process.env.ADMIN_EMAILS || "admin@safeguard.com")
    .split(",")[0]
    .trim()
    .toLowerCase();

  const stationId = station._id.toString();
  const hopeId = hope._id.toString();

  const admin = await upsertUser(
    {
      fullName: "SafeGuard Admin",
      email: adminEmail,
      role: "admin",
      phone: "0601234567",
      address: "Soshanguve Civic Centre, Soshanguve, 0152",
      gender: "prefer_not_to_say",
    },
    ADMIN_PASSWORD
  );

  const reporter = await upsertUser({
    fullName: "Lerato Mokoena",
    email: "reporter@safeguard.local",
    role: "reporter",
    phone: "0712345678",
    address: "Block H, Soshanguve, 0152",
    gender: "female",
    idNumber: "9501015800083",
    policeStationId: stationId,
    policeStationName: "SAPS Soshanguve Police Station",
    preferredNgoId: hopeId,
    preferredNgoName: "Hope Warriors",
    preferredLanguage: "en",
  });

  const reporter2 = await upsertUser({
    fullName: "Nomsa Khumalo",
    email: "reporter2@safeguard.local",
    role: "reporter",
    phone: "0723456789",
    address: "Block NN, Soshanguve, 0152",
    gender: "female",
    idNumber: "9802155800088",
    policeStationId: stationId,
    policeStationName: "SAPS Soshanguve Police Station",
    preferredNgoId: hopeId,
    preferredNgoName: "Hope Warriors",
    preferredLanguage: "en",
  });

  const officer = await upsertUser({
    fullName: "Officer Mandla Nkosi",
    email: "officer@safeguard.local",
    role: "officer",
    phone: "0821112233",
    address: "SAPS Soshanguve Police Station, Soshanguve, 0152",
    gender: "male",
    policeStationId: stationId,
    policeStationName: "SAPS Soshanguve Police Station",
  });

  const ngoWorker = await upsertUser({
    fullName: "Counsellor Ayanda Sithole",
    email: "ngo@safeguard.local",
    role: "ngo_worker",
    phone: "0832223344",
    address: "Hope Warriors Centre, Soshanguve, 0152",
    gender: "female",
    ngoId: hopeId,
    ngoName: "Hope Warriors",
  });

  await ensureContactsForReporter(reporter);
  await ensureContactsForReporter(reporter2);

  await seedOperationalData({
    station,
    hope,
    savwa,
    admin,
    reporter,
    reporter2,
    officer,
    ngoWorker,
  });

  const [reportCount, caseCount, alertCount, userCount] = await Promise.all([
    Report.countDocuments(),
    Case.countDocuments(),
    Alert.countDocuments(),
    User.countDocuments(),
  ]);

  console.log("🌱 Full local seed ready");
  console.log(`   Users: ${userCount} | Reports: ${reportCount} | SOS/Cases: ${caseCount} | Alerts: ${alertCount}`);
  console.log("   Police:", station.name);
  console.log("   NGOs:", hope.name, "+", savwa.name);
  console.log("   Admin:     admin@safeguard.com / Admin123!");
  console.log("   Reporter:  reporter@safeguard.local / DemoPass123!  (Lerato)");
  console.log("   Reporter2: reporter2@safeguard.local / DemoPass123! (Nomsa)");
  console.log("   Officer:   officer@safeguard.local / DemoPass123!");
  console.log("   NGO:       ngo@safeguard.local / DemoPass123!");
}

module.exports = { ensureLocalSeedData };
