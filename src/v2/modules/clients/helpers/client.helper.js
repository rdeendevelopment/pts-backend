function normalizeClientName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function generateClientCode(name) {
  const normalized = normalizeClientName(name);
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
    .toUpperCase();

  return slug || 'CLIENT';
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return [...new Set(
    tags
      .map((tag) => String(tag).trim().toLowerCase())
      .filter(Boolean)
  )];
}

module.exports = {
  normalizeClientName,
  generateClientCode,
  normalizeTags,
};
