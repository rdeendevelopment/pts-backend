const winston = require('winston');
const env = require('../../config/env');

let logger;

function createLogger() {
  const format = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  return winston.createLogger({
    level: env.v2.logLevel,
    defaultMeta: {
      service: 'pts-api-v2',
      environment: env.nodeEnv,
    },
    transports: [
      new winston.transports.Console({ format }),
    ],
  });
}

function getLogger() {
  if (!logger) {
    logger = createLogger();
  }
  return logger;
}

function info(message, meta = {}) {
  getLogger().info(message, meta);
}

function warn(message, meta = {}) {
  getLogger().warn(message, meta);
}

function error(message, meta = {}) {
  getLogger().error(message, meta);
}

module.exports = {
  getLogger,
  info,
  warn,
  error,
};
