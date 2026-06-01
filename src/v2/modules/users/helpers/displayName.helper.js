function buildDisplayName(firstName, lastName, displayName) {
  if (displayName && String(displayName).trim()) {
    return String(displayName).trim();
  }

  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  return [first, last].filter(Boolean).join(' ').trim();
}

module.exports = {
  buildDisplayName,
};
