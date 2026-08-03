const bcrypt = require("bcryptjs");
const prisma = require("./prisma");
const { syncRoleProfile } = require("../services/roleProfileService");

const DEMO_PASSWORD = "DemoPass123!";
const ADMIN_PASSWORD = "Admin123!";

const SOSHANGUVE_POINTS = [
  { lng: 28.0995, lat: -25.5228, address: "Block H, Soshanguve, Pretoria, 0152" },
  { lng: 28.1082, lat: -25.5301, address: "Soshanguve Plaza area, Soshanguve, 0152" },
  { lng: 28.0904, lat: -25.5156, address: "Tshego Street, Soshanguve, 0152" },
  { lng: 28.1157, lat: -25.5374, address: "Block NN, Soshanguve, 0152" },
  { lng: 28.1033, lat: -25.5269, address: "Near SAPS Soshanguve Police Station, 0152" },
];

const point = (p) => ({
  type: "Point",
  coordinates: [p.lng, p.lat],
  address: p.address,
  accuracy: 15,
});

async function upsertOrg(model, code, data) {
  return prisma[model].upsert({
    where: { code },
    create: { ...data, code },
    update: data,
  });
}

async function upsertUser(payload, password = DEMO_PASSWORD) {
  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email: payload.email },
    create: { ...payload, password: hashed, isVerified: true },
    update: { ...payload, password: hashed, isVerified: true },
  });
  await syncRoleProfile(user);
  return user;
}

async function ensureContactsForReporter(reporter) {
  const existing = await prisma.emergencyContact.count({ where: { userId: reporter.id } });
  if (existing > 0) return;

  await prisma.emergencyContact.createMany({
    data: [
      {
        userId: reporter.id,
        fullName: "Thandi Molefe",
        name: "Thandi Molefe",
        relationship: "Sister",
        phone: "0823456789",
        email: "thandi.molefe@example.com",
      },
      {
        userId: reporter.id,
        fullName: "Sipho Dlamini",
        name: "Sipho Dlamini",
        relationship: "Friend",
        phone: "0734567890",
        email: "sipho.dlamini@example.com",
      },
    ],
  });
}

async function seedOperationalData({ station, hope, admin, reporter, reporter2, officer, ngoWorker }) {
  const existing = await prisma.report.findFirst({ where: { clientRequestId: "seed-report-1" } });
  if (existing) {
    console.log("   Operational demo cases already present — skipping recreate");
    return;
  }

  const stationId = station.id;
  const hopeId = hope.id;
  const loc = (i) => point(SOSHANGUVE_POINTS[i % SOSHANGUVE_POINTS.length]);

  const defs = [
    {
      clientRequestId: "seed-report-1",
      caseId: "GBV-20260803-1001",
      userId: reporter.id,
      incidentType: "Domestic Violence",
      description: "Reporter was assaulted by an intimate partner at home in Soshanguve Block H.",
      status: "pending",
      location: loc(0),
      statusHistory: [{ status: "pending", changedAt: new Date().toISOString(), reason: "Submitted" }],
    },
    {
      clientRequestId: "seed-report-2",
      caseId: "GBV-20260803-1002",
      userId: reporter.id,
      incidentType: "Harassment",
      description: "Ongoing harassment near Soshanguve Plaza.",
      status: "investigating",
      location: loc(1),
      statusHistory: [
        { status: "pending", changedAt: new Date().toISOString(), reason: "Submitted" },
        { status: "investigating", changedAt: new Date().toISOString(), reason: "Officer assigned", changedByRole: "officer" },
      ],
    },
    {
      clientRequestId: "seed-report-3",
      caseId: "GBV-20260803-1003",
      userId: reporter.id,
      incidentType: "Stalking",
      description: "Unknown person has been stalking the reporter around Tshego Street.",
      status: "referred_to_ngo",
      referredNgoId: hopeId,
      referredNgoName: "Hope Warriors",
      location: loc(2),
      statusHistory: [
        { status: "pending", changedAt: new Date().toISOString(), reason: "Submitted" },
        { status: "investigating", changedAt: new Date().toISOString(), reason: "Opened" },
        { status: "referred_to_ngo", changedAt: new Date().toISOString(), reason: "Referred to Hope Warriors" },
      ],
      interactions: [
        { type: "note", description: "Survivor agreed to NGO counselling referral.", createdAt: new Date().toISOString() },
      ],
    },
    {
      clientRequestId: "seed-report-4",
      caseId: "GBV-20260803-1004",
      userId: reporter.id,
      incidentType: "Assault",
      description: "Physical assault reported near the police station precinct.",
      status: "resolved",
      location: loc(4),
      statusHistory: [
        { status: "pending", changedAt: new Date().toISOString(), reason: "Submitted" },
        { status: "resolved", changedAt: new Date().toISOString(), reason: "Closed" },
      ],
    },
    {
      clientRequestId: "seed-report-5",
      caseId: "GBV-20260803-1005",
      userId: reporter2.id,
      incidentType: "Domestic Violence",
      description: "Incident reported from Block NN.",
      status: "pending",
      location: loc(3),
      statusHistory: [{ status: "pending", changedAt: new Date().toISOString(), reason: "Submitted" }],
    },
    {
      clientRequestId: "seed-report-6",
      caseId: "GBV-20260803-1006",
      userId: reporter2.id,
      incidentType: "Harassment",
      description: "Verbal harassment while commuting in Soshanguve.",
      status: "investigating",
      location: loc(1),
      statusHistory: [
        { status: "pending", changedAt: new Date().toISOString(), reason: "Submitted" },
        { status: "investigating", changedAt: new Date().toISOString(), reason: "Under review" },
      ],
    },
  ];

  for (const def of defs) {
    await prisma.report.create({
      data: {
        caseId: def.caseId,
        userId: def.userId,
        policeStationId: stationId,
        preferredNgoId: hopeId,
        referredNgoId: def.referredNgoId || null,
        referredNgoName: def.referredNgoName || null,
        clientRequestId: def.clientRequestId,
        incidentType: def.incidentType,
        description: def.description,
        status: def.status,
        location: def.location,
        statusHistory: def.statusHistory || [],
        interactions: def.interactions || [],
      },
    });
  }

  const sosActive = await prisma.case.create({
    data: {
      userId: reporter.id,
      policeStationId: stationId,
      caseId: "SOS-A1B2C3",
      type: "emergency",
      priority: "critical",
      status: "active",
      location: loc(4),
      sosTriggeredAt: new Date(),
      notifiedContacts: [],
    },
  });

  await prisma.alert.create({
    data: {
      userId: reporter.id,
      caseId: sosActive.id,
      policeStationId: stationId,
      type: "sos",
      status: "active",
      location: loc(4),
    },
  });

  const sosResolved = await prisma.case.create({
    data: {
      userId: reporter.id,
      policeStationId: stationId,
      caseId: "SOS-D4E5F6",
      type: "emergency",
      priority: "critical",
      status: "resolved",
      location: loc(0),
      sosTriggeredAt: new Date(Date.now() - 86400000),
      notifiedContacts: [],
    },
  });

  await prisma.alert.create({
    data: {
      userId: reporter.id,
      caseId: sosResolved.id,
      policeStationId: stationId,
      type: "sos",
      status: "resolved",
      location: loc(0),
      acknowledgedById: officer.id,
      acknowledgedAt: new Date(),
      resolvedAt: new Date(),
    },
  });

  await prisma.notification.createMany({
    data: [
      { userId: reporter.id, message: "Your report GBV-20260803-1001 was received by SAPS Soshanguve." },
      { userId: officer.id, message: "New SOS SOS-A1B2C3 requires attention." },
      { userId: ngoWorker.id, message: "Referral GBV-20260803-1003 assigned to Hope Warriors." },
      { userId: admin.id, message: "System seed completed successfully." },
    ],
  });

  console.log("   Reports: 6 demo GBV cases across pending/investigating/referred/resolved");
  console.log("   SOS: SOS-A1B2C3 (active), SOS-D4E5F6 (resolved)");
}

async function ensureSeedData() {
  // Seed when explicitly requested, or when DB is empty in any environment with SEED_IF_EMPTY.
  if (process.env.SEED_IF_EMPTY !== "true") {
    return;
  }

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log("🌱 SEED_IF_EMPTY skipped — users already exist");
    return;
  }

  console.log("🌱 Seeding PostgreSQL demo data...");

  const station = await upsertOrg("policeStation", "soshanguve-0152", {
    name: "SAPS Soshanguve Police Station",
    phone: "012 730 1300",
    email: "thinesamuel@saps.gov.za",
    address: "2091 Commissioner St, Soshanguve - H, Soshanguve, 0152",
    active: true,
  });

  const hope = await upsertOrg("ngoOrg", "hope-warriors", {
    name: "Hope Warriors",
    phone: "012 943 7265",
    email: "director@hopewarriorscharity.org.za",
    address: "459/19 Thwalo Street B1, Block, Soshanguve - XX, Soshanguve, 0152",
    active: true,
  });

  const savwa = await upsertOrg("ngoOrg", "savwa", {
    name: "South Africa Volunteer Work Camp Association (SAVWA)",
    phone: "073 241 1341",
    email: "info@powa.co.za",
    address: "Phase 3, Tshego street Block, 277, Soshanguve - NN, Soshanguve, 0152",
    active: true,
  });

  const adminEmail = String(process.env.ADMIN_EMAILS || "admin@safeguard.com")
    .split(",")[0]
    .trim()
    .toLowerCase();

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
    policeStationId: station.id,
    policeStationName: "SAPS Soshanguve Police Station",
    preferredNgoId: hope.id,
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
    policeStationId: station.id,
    policeStationName: "SAPS Soshanguve Police Station",
    preferredNgoId: hope.id,
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
    policeStationId: station.id,
    policeStationName: "SAPS Soshanguve Police Station",
  });

  const ngoWorker = await upsertUser({
    fullName: "Counsellor Ayanda Sithole",
    email: "ngo@safeguard.local",
    role: "ngo_worker",
    phone: "0832223344",
    address: "Hope Warriors Centre, Soshanguve, 0152",
    gender: "female",
    ngoId: hope.id,
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
    prisma.report.count(),
    prisma.case.count(),
    prisma.alert.count(),
    prisma.user.count(),
  ]);

  console.log("🌱 PostgreSQL seed ready");
  console.log(`   Users: ${userCount} | Reports: ${reportCount} | SOS/Cases: ${caseCount} | Alerts: ${alertCount}`);
  console.log("   Admin:     admin@safeguard.com / Admin123!");
  console.log("   Reporter:  reporter@safeguard.local / DemoPass123!");
  console.log("   Officer:   officer@safeguard.local / DemoPass123!");
  console.log("   NGO:       ngo@safeguard.local / DemoPass123!");
}

module.exports = { ensureSeedData };
