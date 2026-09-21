const env = require('../../config/env');

/**
 * Development-only timing middleware to measure request durations.
 * Logs timing info only if DEBUG_TIMING env var is set.
 */
function requestTimingMiddleware(req, res, next) {
  if (!env.isDevelopment || !process.env.DEBUG_TIMING) {
    return next();
  }

  const startTime = Date.now();
  const path = `${req.method} ${req.path}`;

  // Store start time on request for use in other middleware
  req.timings = {
    start: startTime,
    middlewareStart: startTime,
  };

  // Hook res.json to log timing
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    const elapsed = Date.now() - startTime;
    if (elapsed > 500) {
      const dbTime = req.timings.dbEnd - req.timings.dbStart || 0;
      const authTime = req.timings.authEnd - req.timings.authStart || 0;
      const otherTime = elapsed - dbTime - authTime;

      console.log(
        `[TIMING] ${path} - ${elapsed}ms total (auth: ${authTime}ms, db: ${dbTime}ms, other: ${otherTime}ms)`
      );
    }
    return originalJson(data);
  };

  next();
}

/**
 * Middleware to track database query timing
 */
function dbTimingTracker(req, res, next) {
  if (!env.isDevelopment || !process.env.DEBUG_TIMING || !req.timings) {
    return next();
  }

  req.timings.dbStart = Date.now();
  next();
  setTimeout(() => {
    req.timings.dbEnd = Date.now();
  }, 0);
}

module.exports = {
  requestTimingMiddleware,
  dbTimingTracker,
};
