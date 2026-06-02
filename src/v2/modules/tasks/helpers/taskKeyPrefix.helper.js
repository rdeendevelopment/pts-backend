const DEFAULT_PREFIX = 'PTS';

const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'for', 'and', '&', 'at', 'in', 'on', 'to']);

/**
 * Build a short uppercase key from project code or name (e.g. "Elite High School" → "EHS").
 */
function deriveTaskKeyPrefix(projectName, projectCode) {
  const code = String(projectCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length >= 2) return code.slice(0, 8);

  const words = String(projectName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return DEFAULT_PREFIX;

  const initials = words
    .filter((word) => !STOP_WORDS.has(word.toLowerCase()))
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, '').charAt(0))
    .filter(Boolean)
    .join('')
    .toUpperCase();

  if (initials.length >= 2) return initials.slice(0, 8);

  const single = words[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (single.length >= 2) return single.slice(0, 8);

  return DEFAULT_PREFIX;
}

function formatTaskDisplayId(taskKeyPrefix, taskNumber) {
  const prefix = String(taskKeyPrefix || DEFAULT_PREFIX).trim().toUpperCase() || DEFAULT_PREFIX;
  const num = Number(taskNumber);
  if (!Number.isFinite(num) || num <= 0) return '';
  return `${prefix}-${num}`;
}

module.exports = {
  DEFAULT_PREFIX,
  deriveTaskKeyPrefix,
  formatTaskDisplayId,
};
