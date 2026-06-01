function buildMeta(res, extra = {}) {
  return {
    requestId: res.locals.requestId || null,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function sendSuccess(res, data, options = {}) {
  const status = options.status || 200;
  return res.status(status).json({
    success: true,
    data,
    meta: buildMeta(res, options.meta),
  });
}

module.exports = {
  sendSuccess,
  buildMeta,
};
