function pickField(payload = {}, ...keys) {
  for (const key of keys) {
    if (payload[key] !== undefined) return payload[key];
  }
  return undefined;
}

function pickString(payload = {}, ...keys) {
  const value = pickField(payload, ...keys);
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function pickNumber(payload = {}, ...keys) {
  const value = pickField(payload, ...keys);
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pickArray(payload = {}, ...keys) {
  const value = pickField(payload, ...keys);
  return Array.isArray(value) ? value : undefined;
}

function pickBoolean(payload = {}, ...keys) {
  const value = pickField(payload, ...keys);
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

function parsePagination(query = {}, defaults = { limit: 50, max: 200 }) {
  const limit = Math.min(
    Math.max(parseInt(query.limit || query.page_size || defaults.limit, 10) || defaults.limit, 1),
    defaults.max
  );
  const page = Math.max(parseInt(query.page || '1', 10) || 1, 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
}

module.exports = {
  pickField,
  pickString,
  pickNumber,
  pickArray,
  pickBoolean,
  parsePagination,
};
