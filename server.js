// server.js — PTS API v2 only
const express = require("express");
const fileUpload = require("express-fileupload");
const http = require("http");
const fs = require("fs");
const path = require("path");

const constants = require("./config/constants");
const { connectMongo } = require("./config/mongo");

const environment = String(
  constants.APP_ENV || process.env.NODE_ENV || ""
).toLowerCase();

if (environment === "production") {
  const secret = String(constants.APP_SECRET || "").trim();

  if (!secret || secret.length < 16) {
    console.error(
      "[bootstrap] APP_SECRET must be set (env APP_SECRET) and contain at least 16 characters in production."
    );

    process.exit(1);
  }
}

const app = express();

app.set("trust proxy", true);

app.use(
  express.json({
    limit: "1gb",
  })
);

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
    limits: {
      fileSize: 1024 * 1024 * 1024,
    },
    abortOnLimit: true,
  })
);

/**
 * CORS
 *
 * This preserves the existing API behavior.
 * Approved frontend origins can be restricted separately.
 */
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

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return next();
});

/**
 * Upload directories
 */
const uploadDirectory = path.resolve("src/storage/uploads");

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

app.use(
  "/uploads",
  express.static(uploadDirectory, {
    fallthrough: true,
  })
);

app.use(
  "/uploads",
  express.static(path.resolve("uploads"), {
    fallthrough: true,
  })
);

/**
 * Basic status routes
 */
app.get("/", (_req, res) => {
  return res.json({
    status: "ok",
    env: constants.APP_ENV,
    version: constants.API_VERSION,
    apiMode: "v2-only",
  });
});

app.get("/healthz", (_req, res) => {
  return res.status(200).send("ok");
});

/**
 * PTS v2 API
 */
const v2Api = require("./src/v2");

app.use("/api/v2", v2Api.router);

global.__ptsExpressApp = app;

/**
 * Register fallback and error routes only once.
 */
let fallbackRoutesRegistered = false;

function registerFallbackRoutes() {
  if (fallbackRoutesRegistered) {
    return;
  }

  fallbackRoutesRegistered = true;

  app.use((req, res) => {
    return res.status(404).json({
      message: "Not Found",
    });
  });

  app.use((err, req, res, _next) => {
    const isDevelopment =
      String(
        process.env.NODE_ENV || constants.APP_ENV || ""
      ).toLowerCase() === "development";

    const status = Number(err.status || err.statusCode || 500);

    const clientMessage =
      status >= 500 && !isDevelopment
        ? "Internal Server Error"
        : err.message || "Internal Server Error";

    return res.status(status).json({
      message: clientMessage,
      ...(isDevelopment
        ? {
            stack: err.stack,
          }
        : {}),
    });
  });
}

/**
 * HTTP server
 */
const port = normalizePort(constants.APP_PORT);

app.set("port", port);

const server = http.createServer(app);

server.on("error", (error) => {
  handleError(error, port);
});

/**
 * Initialize Socket.IO after the database and v2 bootstrap are ready.
 */
function initializeSocketServer() {
  if (process.env.PTS_V2_ENABLED === "false") {
    return;
  }

  const { Server } = require("socket.io");

  const {
    SOCKET_CORS,
  } = require("./src/v2/modules/socket/constants/socket.constants");

  const { initializeSocket } = require("./src/v2/modules/socket");

  const io = new Server(server, {
    cors: SOCKET_CORS,
  });

  initializeSocket(io);

  server.__ptsIo = io;

  console.log("[bootstrap] Socket.IO ready (namespace /v2 only)");
}

/**
 * Application startup
 *
 * Required order:
 * 1. Connect MongoDB
 * 2. Complete PTS v2 bootstrap
 * 3. Register fallback routes
 * 4. Initialize Socket.IO
 * 5. Start accepting HTTP requests
 */
async function startServer() {
  try {
    console.log("[bootstrap] Connecting to MongoDB...");

    await connectMongo();

    console.log("[bootstrap] MongoDB connected");
    console.log("[bootstrap] Starting PTS v2 bootstrap...");

    await v2Api.bootstrap();

    console.log("[bootstrap] PTS v2 bootstrap completed");

    registerFallbackRoutes();
    initializeSocketServer();

    server.listen(port, () => {
      console.log(
        `🚀 ${constants.APP_TITLE} running in ${constants.APP_ENV} on port ${port} (v2-only)`
      );
    });
  } catch (error) {
    console.error(
      "[bootstrap] Application startup failed:",
      error?.stack || error?.message || error
    );

    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
let shutdownStarted = false;

function shutdown(signal) {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;

  console.log(`Shutting down gracefully after ${signal}...`);

  const forceExitTimer = setTimeout(() => {
    console.error(
      "[shutdown] Graceful shutdown exceeded 10 seconds. Forcing exit."
    );

    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  try {
    const {
      shutdownSocket,
    } = require(
      "./src/v2/modules/socket/services/socketServer.service"
    );

    shutdownSocket();
  } catch (error) {
    console.error(
      "[shutdown] Socket shutdown failed:",
      error?.message || error
    );
  }

  try {
    const { stopScheduler } = require("./src/v2/scheduler");

    Promise.resolve(stopScheduler()).catch((error) => {
      console.error(
        "[shutdown] Scheduler shutdown failed:",
        error?.message || error
      );
    });
  } catch (error) {
    console.error(
      "[shutdown] Unable to stop scheduler:",
      error?.message || error
    );
  }

  const finish = (exitCode) => {
    clearTimeout(forceExitTimer);
    process.exit(exitCode);
  };

  const io = server.__ptsIo;

  if (io && typeof io.close === "function") {
    io.close(() => {
      finish(0);
    });

    return;
  }

  if (server.listening) {
    server.close((error) => {
      if (error) {
        console.error(
          "[shutdown] HTTP server shutdown failed:",
          error?.message || error
        );

        finish(1);
        return;
      }

      finish(0);
    });

    return;
  }

  finish(0);
}

process.once("SIGINT", () => {
  shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});

/**
 * Helpers
 */
function normalizePort(value) {
  const normalizedPort = parseInt(value, 10);

  if (Number.isNaN(normalizedPort)) {
    return value;
  }

  if (normalizedPort >= 0) {
    return normalizedPort;
  }

  return false;
}

function handleError(error, portValue) {
  if (error.syscall !== "listen") {
    throw error;
  }

  const binding =
    typeof portValue === "string"
      ? `Pipe ${portValue}`
      : `Port ${portValue}`;

  switch (error.code) {
    case "EACCES":
      console.error(`${binding} requires elevated privileges`);
      process.exit(1);
      break;

    case "EADDRINUSE":
      console.error(`${binding} is already in use`);
      process.exit(1);
      break;

    default:
      throw error;
  }
}

/**
 * Application entry point
 */
startServer();