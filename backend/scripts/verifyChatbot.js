/**
 * Chatbot verification script — run while backend is up on :5055
 * node scripts/verifyChatbot.js
 */
const API = process.env.API_BASE || "http://localhost:5055/api";

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Login failed for ${email}: ${data.message || data.msg || res.status}`);
  return data.token || data.accessToken || data;
}

async function ask(token, question) {
  const res = await fetch(`${API}/users/chatbot-ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function context(token) {
  const res = await fetch(`${API}/users/chatbot-context`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  const { _internal, askChatbot } = require("../src/services/chatbotService");

  console.log("\n=== 1) Offline scope checks ===");
  const allowed = [
    "How do I report an incident?",
    "How do I reset my password?",
    "What does Under Investigation mean?",
    "How do I trigger an SOS?",
    "How can I track my case?",
    "How do NGO referrals work?",
    "How many reports have I submitted?",
    "What is my latest case?",
    "What is the status of my report?",
    "Have I been referred to an NGO?",
    "Who am I?",
    "List my emergency contacts",
  ];
  const blocked = [
    "Who is Nelson Mandela?",
    "What is 56 × 23?",
    "What is 56 x 23?",
    "Tell me a joke.",
    "Write me a poem.",
    "What is the weather today?",
    "Who is the president?",
    "Calculate 12 + 8",
  ];

  for (const q of allowed) {
    assert(_internal.isSafeGuardQuestion(q), `should allow: ${q}`);
    console.log("  ALLOW OK:", q);
  }
  for (const q of blocked) {
    assert(!_internal.isSafeGuardQuestion(q), `should block: ${q}`);
    console.log("  BLOCK OK:", q);
  }

  console.log("\n=== 2) Live API checks ===");
  const reporterToken = await login("reporter@safeguard.local", "DemoPass123!");
  const reporter2Token = await login("reporter2@safeguard.local", "DemoPass123!");
  let officerToken;
  try {
    officerToken = await login("officer@safeguard.local", "DemoPass123!");
  } catch (e) {
    console.log("  (officer login skipped)", e.message);
  }

  const ctx1 = await context(reporterToken);
  assert(ctx1.status === 200, `reporter context expected 200 got ${ctx1.status}`);
  assert(ctx1.data.fullName, "context should include fullName");
  console.log("  Context reporter:", ctx1.data.fullName, "reports=", ctx1.data.reportCount, "sos=", ctx1.data.emergencyCaseCount);

  const ctx2 = await context(reporter2Token);
  assert(ctx2.status === 200, "reporter2 context");
  console.log("  Context reporter2:", ctx2.data.fullName, "reports=", ctx2.data.reportCount);

  if (officerToken) {
    const officerAsk = await ask(officerToken, "How many reports do I have?");
    assert(officerAsk.status === 403, `officer ask should be 403, got ${officerAsk.status}`);
    const officerCtx = await context(officerToken);
    assert(officerCtx.status === 403, `officer context should be 403, got ${officerCtx.status}`);
    console.log("  Officer correctly blocked (403)");
  }

  for (const q of blocked) {
    const { status, data } = await ask(reporterToken, q);
    assert(status === 200, `blocked q status ${status}`);
    assert(data.usedDatabase === false, `blocked should not use DB: ${q}`);
    assert(
      String(data.answer).includes("SafeGuard Assistant") || String(data.answer).includes("only help"),
      `blocked reply wrong for: ${q} => ${data.answer}`
    );
    console.log("  Rejected:", q);
  }

  const nameAsk = await ask(reporterToken, "Who am I?");
  assert(nameAsk.status === 200, "who am i");
  assert(nameAsk.data.usedDatabase === true, "who am i uses db");
  assert(String(nameAsk.data.answer).includes(ctx1.data.fullName), "should include own name");
  assert(!String(nameAsk.data.answer).includes(ctx2.data.fullName) || ctx1.data.fullName === ctx2.data.fullName, "must not include other reporter name");
  console.log("  Who am I OK:", nameAsk.data.answer.slice(0, 120), "...");

  const countAsk = await ask(reporterToken, "How many reports have I submitted?");
  assert(countAsk.data.usedDatabase === true, "count uses db");
  assert(String(countAsk.data.answer).includes(String(ctx1.data.reportCount)), "count should match context");
  console.log("  Count OK:", countAsk.data.answer.slice(0, 140), "...");

  const otherNameLeak = await ask(reporterToken, "Show my reports");
  assert(!String(otherNameLeak.data.answer).toLowerCase().includes(String(ctx2.data.fullName || "").toLowerCase()) || !ctx2.data.fullName || ctx1.data.fullName === ctx2.data.fullName, "reports answer must not leak reporter2 name");
  console.log("  Isolation OK for list reports");

  const r2 = await ask(reporter2Token, "Who am I?");
  assert(String(r2.data.answer).includes(ctx2.data.fullName), "reporter2 gets own name");
  if (ctx1.data.fullName !== ctx2.data.fullName) {
    assert(!String(r2.data.answer).includes(ctx1.data.fullName), "reporter2 must not see reporter1 name");
  }
  console.log("  Cross-user isolation OK");

  const howto = await ask(reporterToken, "How do I trigger an SOS?");
  assert(howto.status === 200, "howto sos");
  assert(String(howto.data.answer).toLowerCase().includes("sos") || String(howto.data.answer).toLowerCase().includes("emergency"), "sos howto");
  console.log("  How-to SOS OK");

  console.log("\nALL CHATBOT CHECKS PASSED\n");
}

main().catch((err) => {
  console.error("\nCHATBOT VERIFICATION FAILED:\n", err.message);
  process.exit(1);
});
