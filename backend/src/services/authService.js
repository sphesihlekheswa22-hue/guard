const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.registerUser = async ({ fullName, email, password }) => {
  const hashed = await bcrypt.hash(password, 10);

  return prisma.user.create({
    data: {
      fullName,
      email,
      password: hashed,
    },
  });
};

exports.loginUser = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error("Invalid credentials");

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);

  await prisma.authSession.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });

  return { token };
};
