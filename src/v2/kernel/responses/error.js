function sendError(res, options = {}) {
  const status = options.status || 500;
  const error = {
    code: options.code || 'INTERNAL_ERROR',
    message: options.message || 'Internal Server Error',
  };

  if (options.details !== undefined && options.details !== null) {
    error.details = options.details;
  }

  return res.status(status).json({
    success: false,
    error,
    meta: {
      requestId: res.locals.requestId || null,
      timestamp: new Date().toISOString(),
    },
  });
}

module.exports = {
  sendError,
};
