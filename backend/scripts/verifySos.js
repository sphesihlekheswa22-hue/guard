/**
 * SOS end-to-end verification (backend + notify payloads).
 * Run while API is up: node scripts/verifySos.js
 *
 * Note: EmailJS is browser-side; this script verifies API creates cases/alerts,
 * WhatsApp link generation, police visibility, geofence, and audit fields.
 */
const API = process.env.API_BASE || "http://localhost:5055/api";

// Central Soshanguve point (inside bounds)
const SOSHANGUVE = {
  latitude: -25.522,
  longitude: 28.1,
  address: "Soshanguve Block H, Pretoria",
  accuracy: 12,
};

const OUTSIDE = {
  latitude: -26.2041,
  longitude: 28.0473,
  address: "Johannesburg CBD",
  accuracy: 12,
};

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Login failed for ${email}: ${data.message || data.msg || res.status}`);
  return { token: data.token, user: data.user };
}

async function triggerSos(token, location) {
  const res = await fetch(`${API}/cases/sos/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(location),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  const { buildWhatsAppLink, buildSosNotifications } = require("../src/services/sosNotifyService");

  console.log("\n=== 1) WhatsApp link unit checks ===");
  const link = buildWhatsAppLink("0823456789", "test message");
  assert(link && link.startsWith("https://wa.me/27823456789?text="), `bad SA phone link: ${link}`);
  console.log("  WA link OK:", link.slice(0, 60) + "...");

  const built = buildSosNotifications({
    emergencyContacts: [
      { _id: "1", fullName: "A", phone: "0823456789", email: "a@example.com" },
      { _id: "2", fullName: "B", phone: "0734567890" },
      { _id: "3", fullName: "C", email: "c@example.com" },
    ],
    reporterName: "Lerato",
    locationText: "Soshanguve",
    mapLink: "https://maps.google.com/?q=-25.52,28.1",
  });
  assert(built.whatsapp.length === 2, `expected 2 WA links, got ${built.whatsapp.length}`);
  assert(built.emailTargets.length === 2, `expected 2 email targets, got ${built.emailTargets.length}`);
  console.log("  Notification builder OK");

  console.log("\n=== 2) Live SOS API ===");
  const reporter = await login("reporter@safeguard.local", "DemoPass123!");
  const officer = await login("officer@safeguard.local", "DemoPass123!");

  const blockedGeo = await triggerSos(reporter.token, OUTSIDE);
  assert(blockedGeo.status === 400, `outside Soshanguve should 400, got ${blockedGeo.status}`);
  console.log("  Geofence reject OK");

  const officerSos = await triggerSos(officer.token, SOSHANGUVE);
  assert(officerSos.status === 403, `officer SOS should 403, got ${officerSos.status}`);
  console.log("  Non-reporter blocked OK");

  const sos = await triggerSos(reporter.token, SOSHANGUVE);
  assert(sos.status === 201, `SOS create expected 201 got ${sos.status}: ${JSON.stringify(sos.data)}`);
  assert(sos.data.case?.caseId?.startsWith("SOS-"), `bad caseId ${sos.data.case?.caseId}`);
  assert(sos.data.alert?._id, "alert missing");
  assert(Array.isArray(sos.data.whatsappNotifications), "whatsappNotifications missing");
  assert(sos.data.whatsappNotifications.length >= 1, "expected WhatsApp links for seeded contacts");
  assert(
    sos.data.whatsappNotifications.every((w) => String(w.link).startsWith("https://wa.me/")),
    "invalid WhatsApp link"
  );
  assert(sos.data.emailNotifications?.pendingClientSend === true, "email should be pending client EmailJS send");
  assert(sos.data.emergencyContacts?.length >= 1, "emergency contacts missing");
  assert(Array.isArray(sos.data.case?.notifiedContacts), "notifiedContacts not logged on case");
  console.log("  SOS created:", sos.data.case.caseId);
  console.log("  WA links:", sos.data.whatsappNotifications.length);
  console.log("  Email targets pending:", sos.data.emailNotifications.emailTargets);

  console.log("\n=== 3) Police dashboard visibility ===");
  const activeRes = await fetch(`${API}/alerts/active`, {
    headers: { Authorization: `Bearer ${officer.token}` },
  });
  const activeData = await activeRes.json();
  assert(activeRes.ok, `officer active alerts failed ${activeRes.status}`);
  const found = (activeData.alerts || []).find(
    (a) => String(a._id) === String(sos.data.alert._id) || String(a.caseId?._id || a.caseId) === String(sos.data.case._id)
  );
  assert(found, "officer cannot see newly created SOS alert");
  console.log("  Officer sees alert:", found.type, found.status);

  console.log("\n=== 4) Reporter case list caseId ===");
  const casesRes = await fetch(`${API}/cases/me`, {
    headers: { Authorization: `Bearer ${reporter.token}` },
  });
  const casesData = await casesRes.json();
  const own = (casesData.cases || []).find((c) => String(c._id) === String(sos.data.case._id));
  assert(own, "reporter missing own SOS case");
  assert(own.caseId === sos.data.case.caseId, `caseId mangled: ${own.caseId} vs ${sos.data.case.caseId}`);
  console.log("  Reporter caseId OK:", own.caseId);

  console.log("\nALL SOS CHECKS PASSED\n");
  console.log("Manual follow-up: open reporter SOS in browser to confirm EmailJS delivery + WhatsApp tabs.");
}

main().catch((err) => {
  console.error("\nSOS VERIFICATION FAILED:\n", err.message);
  process.exit(1);
});
