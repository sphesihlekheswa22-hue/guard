const prisma = require("../config/prisma");
const { serializeUser } = require("../lib/serialize");
const { syncRoleProfile } = require("../services/roleProfileService");
const { USER_ROLE_SET } = require("../constants/roles");
const { SOSHANGUVE_STATION_NAME, containsSoshanguve } = require("../constants/soshanguve");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

const isValidEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value));

const normalizeFullName = (value = "") => String(value).trim().replace(/\s+/g, " ");

const isValidFullName = (value = "") => /^[\p{L}]+(?: [\p{L}]+)*$/u.test(normalizeFullName(value));

const RESET_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

const hashResetToken = (token = "") =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

const getAdminAllowlist = () =>
  String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

const isAllowlistedAdmin = (email) => {
  const allowlist = getAdminAllowlist();
  if (allowlist.length === 0) return false;
  return allowlist.includes(normalizeEmail(email));
};

const buildAuthUser = (user) => {
  const u = serializeUser(user);
  return {
    _id: u._id,
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    policeStationId: u.policeStationId,
    policeStationName: u.policeStationName,
    ngoId: u.ngoId,
    ngoName: u.ngoName,
    preferredNgoId: u.preferredNgoId,
    preferredNgoName: u.preferredNgoName,
  };
};

const createAuthSession = async (userId, token) =>
  prisma.authSession.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

exports.register = async (req, res) => {
  try {
    console.log("--- 📝 Registration Attempt ---");
    console.log("Register request body:", req.body);
    const {
      fullName,
      email,
      password,
      role,
      policeStationId,
      policeStationName,
      ngoId,
      ngoName,
      preferredNgoId,
      preferredNgoName,
    } = req.body;

    if (!fullName || !email || !password || !role) {
      console.error("❌ Registration failed: Missing required fields");
      return res.status(400).json({ msg: "Missing required fields" });
    }

    const normalizedFullName = normalizeFullName(fullName);
    const normalizedEmail = normalizeEmail(email);

    if (!isValidFullName(normalizedFullName)) {
      console.error("❌ Registration failed: Invalid full name:", fullName);
      return res.status(400).json({ msg: "Full name can only contain letters and spaces." });
    }

    if (!isValidEmail(normalizedEmail)) {
      console.error("❌ Registration failed: Invalid email address:", email);
      return res.status(400).json({ msg: "Please enter a valid email address" });
    }

    if (String(password).length < 8) {
      console.error("❌ Registration failed: Password is shorter than 8 characters");
      return res.status(400).json({ msg: "Password must be at least 8 characters long" });
    }

    console.log("✅ Basic fields validated:", { fullName: normalizedFullName, email: normalizedEmail, role });

    if (!USER_ROLE_SET.has(role)) {
      console.error("❌ Registration failed: Invalid role:", role);
      return res.status(400).json({ msg: "Invalid account role selected" });
    }

    if (role === "admin") {
      console.error("❌ Registration failed: Admin registration disabled");
      return res.status(403).json({
        msg: "Admin registration is disabled. Use the fixed admin sign-in account.",
      });
    }

    const resolvedPoliceStationName = policeStationName || SOSHANGUVE_STATION_NAME;
    if (
      (role === "authority" || role === "officer" || role === "reporter") &&
      !containsSoshanguve(resolvedPoliceStationName)
    ) {
      return res.status(400).json({
        msg: "Police officers and reporters must be assigned to SAPS Soshanguve only.",
      });
    }

    if ((role === "authority" || role === "officer") && !policeStationId) {
      console.error(
        "❌ Registration failed: Police station is required for police officer. Received policeStationId:",
        policeStationId
      );
      return res.status(400).json({ msg: "Police station is required for police officer registration" });
    }
    if ((role === "ngo" || role === "ngo_worker") && !ngoId) {
      console.error("❌ Registration failed: NGO is required for NGO/NGO worker. Received ngoId:", ngoId);
      return res.status(400).json({ msg: "NGO is required for NGO/NGO worker registration" });
    }
    if (role === "reporter" && !policeStationId) {
      console.error("❌ Registration failed: Police station is required for reporter");
      return res.status(400).json({ msg: "Police station is required for reporter registration" });
    }
    console.log("✅ Role-specific validation passed");

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      console.error("❌ Registration failed: User already exists with email:", normalizedEmail);
      return res.status(409).json({ msg: "User already exists" });
    }
    console.log("✅ Email is unique");

    const hashed = await bcrypt.hash(password, 10);
    console.log("✅ Password hashed");

    const stationNameForUser =
      role === "authority" || role === "officer" || role === "reporter"
        ? SOSHANGUVE_STATION_NAME
        : policeStationName || null;

    console.log("📦 Creating user with payload:", {
      fullName: normalizedFullName,
      email: normalizedEmail,
      role,
      policeStationId: policeStationId || null,
      policeStationName: stationNameForUser,
      ngoId: ngoId || null,
      ngoName: ngoName || null,
      preferredNgoId: preferredNgoId || null,
      preferredNgoName: preferredNgoName || null,
    });

    const user = await prisma.user.create({
      data: {
        fullName: normalizedFullName,
        email: normalizedEmail,
        password: hashed,
        role,
        policeStationId: policeStationId || null,
        policeStationName: stationNameForUser,
        ngoId: role === "ngo" || role === "ngo_worker" ? ngoId || null : null,
        ngoName: role === "ngo" || role === "ngo_worker" ? ngoName || null : null,
        // Reporters do not choose an NGO — police assign on referral
        preferredNgoId: null,
        preferredNgoName: null,
      },
    });

    console.log("✅✅✅ User CREATED successfully:", user);
    console.log("✅ User fields:", {
      _id: user.id,
      role: user.role,
      policeStationId: user.policeStationId,
      policeStationName: user.policeStationName,
      ngoId: user.ngoId,
      ngoName: user.ngoName,
    });

    const roleProfile = await syncRoleProfile(user);
    console.log("Role-specific profile synced:", roleProfile ? roleProfile.id : "none");

    const verifyUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (verifyUser) {
      console.log("✅✅✅ VERIFIED: User exists in users table!");
      console.log("✅ Verified user email:", verifyUser.email);
      console.log("✅ Verified user role:", verifyUser.role);
      console.log("✅ Verified user policeStationId:", verifyUser.policeStationId);
    } else {
      console.error("❌ CRITICAL ERROR: User was NOT saved to database!");
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
    await createAuthSession(user.id, token);

    res.json({
      token,
      user: buildAuthUser(user),
    });
  } catch (err) {
    console.error("Registration error:", err);
    if (err?.code === "P2002" && err?.meta?.target?.includes("email")) {
      return res.status(409).json({ msg: "An account with this email already exists." });
    }
    res.status(500).json({ msg: "Registration failed", error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return res.status(400).json({ msg: "User not found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ msg: "Invalid credentials" });

  if (user.role === "admin") {
    const allowlist = getAdminAllowlist();
    if (allowlist.length > 0 && !allowlist.includes(normalizeEmail(user.email))) {
      return res.status(403).json({
        msg: "Admin access is restricted. Only the designated admin account can sign in.",
      });
    }
  }

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
  await createAuthSession(user.id, token);

  res.json({
    token,
    user: buildAuthUser(user),
  });
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = normalizeEmail(email);

  try {
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    const genericResponse = {
      message: "If an account exists, a reset link has been sent.",
    };

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const requestedTtl = Number(req.body?.ttlMs);
    const ttlMs =
      process.env.ALLOW_SHORT_RESET_TTL === "true" && Number.isFinite(requestedTtl) && requestedTtl >= 0
        ? requestedTtl
        : RESET_TOKEN_TTL_MS;

    const resetPasswordExpires = new Date(Date.now() + ttlMs);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: hashResetToken(resetToken),
        resetPasswordExpires,
      },
    });

    try {
      const { logAudit } = require("../services/auditService");
      await logAudit({
        user,
        action: "password_reset_requested",
        resourceType: "user",
        resourceId: user.id,
        resourceLabel: user.email,
        details: "Password reset token issued",
        metadata: { expiresAt: resetPasswordExpires },
      });
    } catch (auditErr) {
      console.warn("Password reset audit failed:", auditErr.message);
    }

    res.status(200).json({
      ...genericResponse,
      resetToken,
      expiresAt: resetPasswordExpires,
      expiresInSeconds: Math.floor(RESET_TOKEN_TTL_MS / 1000),
      toName: user.fullName || "User",
      email: user.email,
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.verifyResetToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || !String(token).trim()) {
      return res.status(400).json({ error: "Token is required" });
    }

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashResetToken(token),
        resetPasswordExpires: { gt: new Date() },
      },
      select: { id: true, resetPasswordExpires: true },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    res.status(200).json({
      valid: true,
      expiresAt: user.resetPasswordExpires,
      serverTime: new Date(),
    });
  } catch (err) {
    console.error("Token verification error:", err);
    res.status(400).json({ error: "Invalid or expired token" });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    if (!token || !String(token).trim()) {
      return res.status(400).json({ error: "Token is required" });
    }

    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }

    const hashedToken = hashResetToken(token);
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Password reset token is invalid or has expired." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        resetPasswordToken: hashedToken,
      },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    if (updated.count === 0) {
      return res.status(400).json({ error: "Password reset token is invalid or has expired." });
    }

    try {
      const { logAudit } = require("../services/auditService");
      await logAudit({
        user,
        action: "password_reset_completed",
        resourceType: "user",
        resourceId: user.id,
        resourceLabel: user.email,
        details: "Password reset completed successfully",
      });
    } catch (auditErr) {
      console.warn("Password reset audit failed:", auditErr.message);
    }

    res.status(200).json({ message: "Password has been successfully reset. You can now log in." });
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
