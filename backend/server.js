const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./src/config/db");
const cors = require("cors");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");

dotenv.config();
dotenv.config({ path: "./src/.env" });

const start = async () => {
  await connectDB();

  const app = express();
  const server = http.createServer(app);

  // Reflect any browser Origin (demo deploy: frontend + API are separate Render URLs).
  const corsOptions = {
    origin: true,
    credentials: true,
  };

  const io = socketIO(server, {
    cors: corsOptions
  });

  require("./src/sockets/socket.io")(io);

  app.use(cors(corsOptions));
  app.use(express.json());
  app.locals.io = io;

  app.use(
    "/uploads",
    express.static(path.join(__dirname, "uploads"), {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".webm")) {
          res.setHeader("Content-Type", "audio/webm");
        }
      }
    })
  );

  app.get("/", (req, res) => {
    res.send("API is running");
  });

  app.use("/api/auth", require("./src/routes/authRoutes"));
  app.use("/api/users", require("./src/routes/userRoutes"));
  app.use("/api/reports", require("./src/routes/reportRoutes"));
  app.use("/api/alerts", require("./src/routes/alertRoutes"));
  app.use("/api/cases", require("./src/routes/caseRoutes"));
  app.use("/api/evidence", require("./src/routes/evidenceRoutes"));
  app.use("/api/location", require("./src/routes/locationRoutes"));
  app.use("/api/notifications", require("./src/routes/notificationRoutes"));
  app.use("/api/organizations", require("./src/routes/organizationRoutes"));
  app.use("/api/admin", require("./src/routes/adminRoutes"));

  app.use((err, req, res, next) => {
    console.error("❌ Error:", err.message);
    console.error(err.stack);

    res.status(err.status || 500).json({
      msg: err.message || "Internal Server Error",
      status: err.status || 500
    });
  });

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () =>
    console.log(`🚀 Server running on port ${PORT} with WebSocket support`)
  );
};

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
