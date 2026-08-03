/**
 * Password reset verification.
 * Run with API up: node scripts/verifyPasswordReset.js
 */
const crypto = require("crypto");
const API = process.env.API_BASE || "http://localhost:5055/api";
const EMAIL = "reporter2@safeguard.local";
const OLD_PASSWORD = "DemoPass123!";
const NEW_PASSWORD = "NewDemoPass456!";

const hashResetToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("\n=== 1) Forgot password issues token ===");
  const forgot = await post("/auth/forgot-password", { email: EMAIL });
  assert(forgot.status === 200, `forgot expected 200 got ${forgot.status}`);
  assert(forgot.data.resetToken, "resetToken missing (needed for EmailJS client send)");
  assert(forgot.data.expiresAt, "expiresAt missing");
  assert(forgot.data.email === EMAIL, "email mismatch");
  console.log("  Token issued, expires:", forgot.data.expiresAt);

  console.log("\n=== 2) Verify valid token ===");
  const valid = await post("/auth/verify-reset-token", { token: forgot.data.resetToken });
  assert(valid.status === 200 && valid.data.valid === true, "valid token should verify");
  console.log("  Valid token OK");

  console.log("\n=== 3) Reject invalid tokens ===");
  const bad = await post("/auth/verify-reset-token", { token: "not-a-real-token" });
  assert(bad.status === 400, `invalid token expected 400 got ${bad.status}`);
  const missing = await post("/auth/verify-reset-token", {});
  assert(missing.status === 400, "missing token expected 400");
  const badReset = await post("/auth/reset-password", { token: "nope", newPassword: NEW_PASSWORD });
  assert(badReset.status === 400, "reset with bad token expected 400");
  console.log("  Invalid/missing tokens rejected");

  console.log("\n=== 4) Reject expired tokens ===");
  const expiredIssue = await post("/auth/forgot-password", { email: EMAIL, ttlMs: 1 });
  assert(expiredIssue.data.resetToken, "expiry test token missing");
  await sleep(50);
  const expiredVerify = await post("/auth/verify-reset-token", { token: expiredIssue.data.resetToken });
  assert(expiredVerify.status === 400, "expired token verify should 400");
  const expiredReset = await post("/auth/reset-password", {
    token: expiredIssue.data.resetToken,
    newPassword: NEW_PASSWORD,
  });
  assert(expiredReset.status === 400, "expired token reset should 400");
  console.log("  Expired token rejected");

  // Hash unit checks
  assert(hashResetToken("abc") === hashResetToken("abc"), "hash stable");
  assert(hashResetToken("abc") !== hashResetToken("abcd"), "hash distinct");

  console.log("\n=== 5) Reset password with fresh valid token ===");
  const fresh = await post("/auth/forgot-password", { email: EMAIL });
  const token = fresh.data.resetToken;
  const short = await post("/auth/reset-password", { token, newPassword: "short" });
  assert(short.status === 400, "short password should fail");

  const reset = await post("/auth/reset-password", { token, newPassword: NEW_PASSWORD });
  assert(reset.status === 200, `reset expected 200 got ${reset.status}: ${JSON.stringify(reset.data)}`);
  console.log("  Password updated");

  console.log("\n=== 6) Token cannot be reused ===");
  const reuse = await post("/auth/reset-password", { token, newPassword: "AnotherPass789!" });
  assert(reuse.status === 400, "reused token should fail");
  const reuseVerify = await post("/auth/verify-reset-token", { token });
  assert(reuseVerify.status === 400, "used token verify should fail");
  console.log("  Token reuse rejected");

  console.log("\n=== 7) Login with new password ===");
  const loginNew = await post("/auth/login", { email: EMAIL, password: NEW_PASSWORD });
  assert(loginNew.status === 200 && loginNew.data.token, `login new failed: ${JSON.stringify(loginNew.data)}`);
  console.log("  Login with new password OK");

  const loginOld = await post("/auth/login", { email: EMAIL, password: OLD_PASSWORD });
  assert(loginOld.status === 400, "old password should fail");
  console.log("  Old password rejected");

  console.log("\n=== 8) Restore demo password ===");
  const restoreForgot = await post("/auth/forgot-password", { email: EMAIL });
  const restore = await post("/auth/reset-password", {
    token: restoreForgot.data.resetToken,
    newPassword: OLD_PASSWORD,
  });
  assert(restore.status === 200, "restore failed");
  const loginRestored = await post("/auth/login", { email: EMAIL, password: OLD_PASSWORD });
  assert(loginRestored.status === 200, "restored login failed");
  console.log("  Restored DemoPass123!");

  console.log("\n=== 9) Unknown email does not leak token ===");
  const unknown = await post("/auth/forgot-password", { email: "nobody@example.com" });
  assert(unknown.status === 200, "unknown email should still 200");
  assert(!unknown.data.resetToken, "must not return resetToken for unknown email");
  console.log("  Unknown email OK");

  console.log("\n=== 10) Invalid email rejected ===");
  const invalidEmail = await post("/auth/forgot-password", { email: "not-an-email" });
  assert(invalidEmail.status === 400, "invalid email should 400");
  console.log("  Invalid email rejected");

  console.log("\nALL PASSWORD RESET CHECKS PASSED\n");
  console.log("Note: EmailJS send only works from the browser (non-browser API disabled on EmailJS).");
  console.log("AuthPage sends the reset email client-side when forgot-password returns resetToken.");
}

main().catch((err) => {
  console.error("\nPASSWORD RESET VERIFICATION FAILED:\n", err.message);
  process.exit(1);
});
