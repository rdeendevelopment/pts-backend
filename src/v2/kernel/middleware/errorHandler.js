const { AppError } = require('../errors');
const { sendError } = require('../responses');
const { getLogger } = require('../logger');
const env = require('../../config/env');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const logger = getLogger();

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error('Application error', {
        requestId: req.requestId,
        code: err.code,
        message: err.message,
        stack: err.stack,
      });
    } else {
      logger.warn('Client error', {
        requestId: req.requestId,
        code: err.code,
        message: err.message,
        status: err.status,
      });
    }

    const details = err.fields
      ? { ...(err.details || {}), fields: err.fields }
      : err.details;

    return sendError(res, {
      status: err.status,
      code: err.code,
      message: err.message,
      details,
    });
  }

  logger.error('Unhandled error', {
    requestId: req.requestId,
    message: err?.message || 'Unknown error',
    stack: err?.stack,
  });

  const message = env.isProduction ? 'Internal Server Error' : err?.message || 'Internal Server Error';

  return sendError(res, {
    status: err?.status || 500,
    code: 'INTERNAL_ERROR',
    message,
    details: env.isDevelopment ? { stack: err?.stack } : null,
  });
}

module.exports = errorHandler;
