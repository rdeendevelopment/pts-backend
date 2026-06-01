// server.js — PTS API v2 only
const express = require("express");
const fileUpload = require("express-fileupload");
const http = require("http");
const fs = require("fs");
const path = require("path");

const constants = require("./config/constants");
const { connectMongo } = require("./config/mongo");

const _envLower = String(constants.APP_ENV || process.env.NODE_ENV || "").toLowerCase();
if (_envLower === "production") {
  const secret = String(constants.APP_SECRET || "").trim();
  if (!secret || secret.length < 16) {
    console.error("[bootstrap] APP_SECRET must be set (env APP_SECRET) and at least 16 characters in production.");
    process.exit(1);
  }
}

const app = express();
app.set("trust proxy", true);

app.use(express.json({ limit: "1gb" }));
app.use(
  express.urlencoded({
    limit: "1gb",
    extended: false,
    parameterLimit: 1_000_000,
  })
);

app.use(
  fileUpload({
    createParentPath: true,
    limits: { fileSize: 1024 * 1024 * 1024 },
    abortOnLimit: true,
  })
);

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

const uploadDirectory = path.resolve("src/storage/uploads");
if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}
app.use("/uploads", express.static(uploadDirectory, { fallthrough: true }));
app.use("/uploads", express.static(path.resolve("uploads"), { fallthrough: true }));

app.get("/", (_req, res) =>
  res.json({
    status: "ok",
    env: constants.APP_ENV,
    version: constants.API_VERSION,
    apiMode: "v2-only",
  })
);
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

const v2Api = require("./src/v2");
app.use("/api/v2", v2Api.router);
global.__ptsExpressApp = app;

let fallbackRoutesRegistered = false;

function registerFallbackRoutes() {
  if (fallbackRoutesRegistered) return;
  fallbackRoutesRegistered = true;

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
}

connectMongo()
  .then(async () => {
    try {
      await v2Api.bootstrap();
    } catch (err) {
      console.error(
        "[bootstrap] PTS v2 bootstrap failed:",
        err?.message || err
      );
    } finally {
      registerFallbackRoutes();
    }
  })
  .catch((err) => {
    console.error(
      "[bootstrap] MongoDB connection failed — v2 API will return 503 until fixed:",
      err?.message || err
    );
    registerFallbackRoutes();
  });

const port = normalizePort(constants.APP_PORT);
app.set("port", port);
const server = http.createServer(app);

server.listen(port, () => {
  if (process.env.PTS_V2_ENABLED !== "false") {
    const { Server } = require("socket.io");
    const { SOCKET_CORS } = require("./src/v2/modules/socket/constants/socket.constants");
    const { initializeSocket } = require("./src/v2/modules/socket");
    const io = new Server(server, { cors: SOCKET_CORS });
    initializeSocket(io);
    server.__ptsIo = io;
    console.log("[bootstrap] Socket.IO ready (namespace /v2 only)");
  }

  console.log(
    `🚀 ${constants.APP_TITLE} running in ${constants.APP_ENV} on port ${port} (v2-only)`
  );
});

server.on("error", (error) => handleError(error, port));

function shutdown() {
  console.log("Shutting down gracefully...");
  try {
    const { shutdownSocket } = require("./src/v2/modules/socket/services/socketServer.service");
    shutdownSocket();
  } catch (_err) {
    // ignore
  }
  try {
    const { stopScheduler } = require("./src/v2/scheduler");
    stopScheduler().catch(() => {});
  } catch (_err) {
    // ignore
  }
  const io = server.__ptsIo;
  if (io && typeof io.close === "function") {
    io.close(() => process.exit(0));
  } else {
    server.close(() => process.exit(0));
  }
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

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
