const User = require("../models/users");
const AuthSession = require("../models/authSessions");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.registerUser = async ({ fullName, email, password }) => {
  const hashed = await bcrypt.hash(password, 10);

  return await User.create({
    fullName,
    email,
    password: hashed
  });
};

exports.loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User not found");

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error("Invalid credentials");

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET
  );

  await AuthSession.create({
    userId: user._id,
    token,
    expiresAt: new Date(Date.now() + 86400000)
  });

  return { token };
};
