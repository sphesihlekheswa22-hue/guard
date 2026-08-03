const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const base = path
      .basename(file.originalname || "evidence", ext)
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 80) || "evidence";
    cb(null, `${Date.now()}-${base}${ext.toLowerCase()}`);
  },
});

module.exports = multer({ storage });