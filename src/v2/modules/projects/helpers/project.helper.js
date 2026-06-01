function normalizeProjectName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function generateProjectCode(name) {
  const normalized = normalizeProjectName(name);
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)
    .toUpperCase();

  return slug || 'PROJECT';
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return [...new Set(
    tags
      .map((tag) => String(tag).trim().toLowerCase())
      .filter(Boolean)
  )];
}

function assertValidDateRange(startDate, dueDate) {
  if (!startDate || !dueDate) return;

  const start = new Date(startDate);
  const due = new Date(dueDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(due.getTime())) return;

  if (due < start) {
    const err = new Error('dueDate cannot be before startDate');
    err.code = 'PROJECT_INVALID_DATE_RANGE';
    throw err;
  }
}

function resolveCompletedAt(previousStatus, nextStatus, existingCompletedAt = null) {
  if (nextStatus === 'completed') {
    return existingCompletedAt || new Date();
  }
  if (previousStatus === 'completed' && nextStatus !== 'completed') {
    return null;
  }
  return existingCompletedAt || null;
}

module.exports = {
  normalizeProjectName,
  generateProjectCode,
  normalizeTags,
  assertValidDateRange,
  resolveCompletedAt,
};
