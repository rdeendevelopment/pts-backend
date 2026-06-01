const { randomUUID } = require('crypto');

const HEADER_NAME = 'x-request-id';

function requestId(req, res, next) {
  const incoming = req.headers[HEADER_NAME] || req.headers['X-Request-Id'];
  const id = typeof incoming === 'string' && incoming.trim() ? incoming.trim() : randomUUID();

  req.requestId = id;
  res.locals.requestId = id;
  res.setHeader(HEADER_NAME, id);

  next();
}

module.exports = requestId;
