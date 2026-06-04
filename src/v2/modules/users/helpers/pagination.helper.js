const { Types } = require('mongoose');

function encodeCursor(doc) {
  if (!doc?._id || !doc?.createdAt) return null;
  const payload = {
    c: new Date(doc.createdAt).toISOString(),
    i: String(doc._id),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!parsed?.c || !parsed?.i || !Types.ObjectId.isValid(parsed.i)) {
      return null;
    }
    return {
      createdAt: new Date(parsed.c),
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

function parsePage(rawPage) {
  const parsed = Number(rawPage);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
}

function buildPaginationMeta({ page, limit, total }) {
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    total_pages: totalPages,
    totalPages,
    has_more: totalPages > 0 && page < totalPages,
    hasMore: totalPages > 0 && page < totalPages,
    next_cursor: null,
  };
}

module.exports = {
  encodeCursor,
  decodeCursor,
  parseLimit,
  parsePage,
  buildPaginationMeta,
};
