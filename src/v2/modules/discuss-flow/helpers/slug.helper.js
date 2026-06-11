function toSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

async function ensureUniqueSlug(baseSlug, existsFn, { maxAttempts = 20 } = {}) {
  let slug = toSlug(baseSlug);
  let attempt = 0;

  while (attempt < maxAttempts) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await existsFn(candidate);
    if (!exists) return candidate;
    attempt += 1;
  }

  return `${slug}-${Date.now()}`;
}

module.exports = {
  toSlug,
  ensureUniqueSlug,
};
