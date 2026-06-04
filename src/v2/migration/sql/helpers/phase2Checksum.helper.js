const crypto = require('crypto');

const DAY_FIELDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function dayIndex(dayKey) {
  const idx = DAY_FIELDS.indexOf(String(dayKey || '').toLowerCase());
  return idx >= 0 ? idx : 0;
}

function entryMapOldId(workingHoursId, dayKey) {
  return Number(workingHoursId) * 10 + dayIndex(dayKey);
}

function weekMapOldId(userLegacyId, weekStartDate) {
  const start = weekStartDate instanceof Date ? weekStartDate.toISOString() : String(weekStartDate);
  const hash = crypto.createHash('sha256').update(`${userLegacyId}:${start}`).digest('hex');
  return parseInt(hash.slice(0, 12), 16);
}

function buildEntryChecksum({
  workingHoursId,
  dayKey,
  userLegacyId,
  projectLegacyId,
  minutes,
  note,
}) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      table: 'working_hours',
      workingHoursId,
      dayKey,
      userLegacyId,
      projectLegacyId,
      minutes,
      note: note || null,
    }))
    .digest('hex');
}

function hoursToMinutes(hoursValue) {
  const hours = parseFloat(String(hoursValue ?? '').replace(/,/g, ''));
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.max(1, Math.round(hours * 60));
}

function coerceBool(value) {
  return value === 1 || value === true || value === '1';
}

function coerceDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = {
  DAY_FIELDS,
  dayIndex,
  entryMapOldId,
  weekMapOldId,
  buildEntryChecksum,
  hoursToMinutes,
  coerceBool,
  coerceDate,
};
