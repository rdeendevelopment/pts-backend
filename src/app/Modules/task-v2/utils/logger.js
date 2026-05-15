const winston = require('winston');

const level =
  process.env.LOG_LEVEL ||
  ((process.env.NODE_ENV || '').toLowerCase() === 'production' ? 'info' : 'debug');

const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level: lvl, message, timestamp, ...meta }) => {
      const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [task-v2] ${lvl}: ${message}${extra}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
