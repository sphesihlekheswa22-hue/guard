const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const { serializeUser } = require("../lib/serialize");

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ msg: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded._id || decoded.id;
    if (!userId) return res.status(401).json({ msg: "Invalid token (no user id)" });

    const user = await prisma.user.findUnique({ where: { id: String(userId) } });
    if (!user) return res.status(401).json({ msg: "User not found" });

    // Preserve mongoose-like accessors used across controllers
    const shaped = serializeUser(user, { includePassword: true });
    shaped.id = user.id;
    shaped._id = user.id;
    req.user = shaped;
    next();
  } catch (err) {
    res.status(401).json({ msg: "Invalid token" });
  }
};
