const { Types } = require('mongoose');

function encodeCursor(doc) {
  if (!doc?._id || !doc?.updatedAt) return null;
  const payload = {
    u: new Date(doc.updatedAt).toISOString(),
    i: String(doc._id),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!parsed?.u || !parsed?.i || !Types.ObjectId.isValid(parsed.i)) {
      return null;
    }
    return {
      updatedAt: new Date(parsed.u),
      id: parsed.i,
    };
  } catch (_err) {
    return null;
  }
}

function parseLimit(rawLimit, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.min(Math.floor(parsed), maxLimit);
}

module.exports = {
  encodeCursor,
  decodeCursor,
  parseLimit,
};
