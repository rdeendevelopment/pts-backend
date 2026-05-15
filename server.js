// server.js
const express = require("express");
const fileUpload = require("express-fileupload");
const http = require("http");
const fs = require("fs");
const path = require("path");
const axios = require("axios"); // if you use it in routes
const constants = require("./config/constants");

// Fail fast in production if JWT signing secret is missing or trivially weak.
const _envLower = String(constants.APP_ENV || process.env.NODE_ENV || "").toLowerCase();
if (_envLower === "production") {
  const secret = String(constants.APP_SECRET || "").trim();
  if (!secret || secret.length < 16) {
    console.error("[bootstrap] APP_SECRET must be set (env APP_SECRET) and at least 16 characters in production.");
    process.exit(1);
  }
}
const initializeRoutes = require("./src/routes/index");
const { connectMongo } = require("./config/mongo");
const { initSocket } = require("./src/app/Services/task-system/socket.service");

// ─────────────────────────────────────────────────────────────
// App & Middleware
// ─────────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", true);

// JSON/body limits
app.use(express.json({ limit: "1gb" }));
app.use(
  express.urlencoded({
    limit: "1gb",
    extended: false,
    parameterLimit: 1_000_000,
  })
);

// File uploads (keeps everything in memory; switch to temp files if huge)
app.use(
  fileUpload({
    createParentPath: true,
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB per file
    abortOnLimit: true,
  })
);

// CORS (simple, wide-open; tighten if needed)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,PUT,POST,DELETE,PATCH,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, key, Accept-Encoding, Accept-Language, Origin"
  );
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

// ─────────────────────────────────────────────────────────────
// Static uploads directory
// ─────────────────────────────────────────────────────────────
const uploadDirectory = path.resolve("src/storage/uploads");
if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}
// serve uploaded files
app.use("/uploads", express.static(uploadDirectory, { fallthrough: true }));
// Converse attachments are saved under {cwd}/uploads/converse/… (separate from the legacy
// uploads directory above). Fall through so both trees are accessible at /uploads/*.
app.use("/uploads", express.static(path.resolve("uploads"), { fallthrough: true }));

// ─────────────────────────────────────────────────────────────
// Healthcheck & basic root
// ─────────────────────────────────────────────────────────────
app.get("/", (_req, res) =>
  res.json({
    status: "ok",
    env: constants.APP_ENV,
    version: constants.API_VERSION,
  })
);
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────
connectMongo().catch(() => {});
initializeRoutes(app);
const workspaceRoutes = require('./src/app/Routes/task-system/workspace.route');
app.use('/api/task-system/workspace', workspaceRoutes);
const listRoutes = require('./src/app/Routes/task-system/list.route');
app.use('/api/task-system/lists', listRoutes);
const taskRoutes = require('./src/app/Routes/task-system/task.route');
app.use('/api/task-system/tasks', taskRoutes);
const notificationRoutes = require('./src/app/Routes/task-system/notification.route');
app.use('/api/task-system/notifications', notificationRoutes);

// Modules Management
const { router: modulesRouter, seedModules } = require('./src/app/Modules/modules-management');
app.use('/api/modules-management', modulesRouter);
connectMongo().then(() => seedModules()).catch((e) => console.error('[seed] modules-management:', e));

// Converse
const converseRoutes = require('./src/app/Modules/converse/routes');
app.use('/api/converse', converseRoutes);

// Announcements
const { router: announcementsRouter, ensureAnnouncementIndexes } = require('./src/app/Modules/announcements');
app.use('/api/announcements', announcementsRouter);
connectMongo().then(() => ensureAnnouncementIndexes()).catch((e) => console.error('[seed] announcements indexes:', e));

// Task V2 — separate collections + taskV2:* socket events. Legacy tasks remain at /api/task-system/*.
// Rollback: redeploy a build without Task V2 UI routes or git revert; data stays in *V2 collections.
const taskV2BoardRoutes     = require('./src/app/Modules/task-v2/routes/board.routes');
const taskV2PrivateRoutes   = require('./src/app/Modules/task-v2/routes/private-workspace.routes');
app.use('/api/task-v2',         taskV2BoardRoutes);
app.use('/api/task-v2/private', taskV2PrivateRoutes);

// ─────────────────────────────────────────────────────────────
// Upload endpoint
// expects field name "files" (single or multiple)
// ─────────────────────────────────────────────────────────────
app.post("/api/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.files) {
      return res.status(400).json({ message: "No files were uploaded." });
    }

    const files = Array.isArray(req.files.files)
      ? req.files.files
      : [req.files.files];

    const savedFiles = [];
    for (const file of files) {
      const uniqueFilename = `${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}-${file.name.replace(/\s+/g, "_")}`;
      const filePath = path.join(uploadDirectory, uniqueFilename);

      await file.mv(filePath);

      savedFiles.push({
        title: file.name,
        size: file.size,
        url: `/uploads/${uniqueFilename}`, // served by static middleware above
      });
    }

    res.status(200).json({
      message: "Files uploaded and saved successfully.",
      savedFiles,
    });
  } catch (error) {
    console.error("File upload error:", error);
    res
      .status(500)
      .json({ message: "File upload failed.", error: String(error?.message || error) });
  }
});

// ─────────────────────────────────────────────────────────────
// 404 & Error handlers
// ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: "Not Found" });
});

app.use((err, req, res, _next) => {
  const isDev = (process.env.NODE_ENV || "").toLowerCase() === "development";
  const status = err.status || 500;
  const clientMessage =
    status >= 500 && !isDev ? "Internal Server Error" : err.message || "Internal Server Error";
  res.status(status).json({
    message: clientMessage,
    ...(isDev ? { stack: err.stack } : {}),
  });
});

// ─────────────────────────────────────────────────────────────
// Server bootstrap
// ─────────────────────────────────────────────────────────────
const port = normalizePort(constants.APP_PORT);
app.set("port", port);
const server = http.createServer(app);

server.listen(port, () => {
  initSocket(server);
  const { getIO } = require('./src/app/Services/task-system/socket.service');
  const { registerConverseSocket } = require('./src/app/Modules/converse/sockets/converse.socket');
  const { registerV2SocketHandlers } = require('./src/app/Modules/task-v2/sockets/task-v2.socket');
  const io = getIO();
  registerConverseSocket(io);
  io.on('connection', (socket) => {
    registerV2SocketHandlers(socket);
  });
  console.log(
    `🚀 ${constants.APP_TITLE} running in ${constants.APP_ENV} on port ${port}`
  );
});

server.on("error", (error) => handleError(error, port));

// Graceful shutdown (PM2/containers)
function shutdown() {
  console.log("Shutting down gracefully...");
  const { closeSocket } = require("./src/app/Services/task-system/socket.service");
  server.close(() => {
    closeSocket(() => process.exit(0));
  });

  // Force exit if not closed in time
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function normalizePort(val) {
  const p = parseInt(val, 10);
  if (Number.isNaN(p)) return val;
  if (p >= 0) return p;
  return false;
}

function handleError(error, portVal) {
  if (error.syscall !== "listen") throw error;
  const bind = typeof portVal === "string" ? `Pipe ${portVal}` : `Port ${portVal}`;
  switch (error.code) {
    case "EACCES":
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
    case "EADDRINUSE":
      console.error(`${bind} is already in use`);
      process.exit(1);
    default:
      throw error;
  }
}
