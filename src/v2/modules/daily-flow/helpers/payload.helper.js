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

function pickBoolean(payload = {}, ...keys) {
  const value = pickField(payload, ...keys);
  if (value === undefined) return undefined;
  return Boolean(value);
}

function pickNumber(payload = {}, ...keys) {
  const value = pickField(payload, ...keys);
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

module.exports = {
  pickField,
  pickString,
  pickBoolean,
  pickNumber,
};
