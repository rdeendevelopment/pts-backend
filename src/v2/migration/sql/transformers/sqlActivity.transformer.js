const { DAY_FIELDS, hoursToMinutes, coerceBool, coerceDate } = require('../helpers/phase2Checksum.helper');

function buildDailyNotesIndex(dailyNotesRows = []) {
  const index = new Map();
  for (const row of dailyNotesRows) {
    const whId = Number(row.working_hours_id);
    if (!index.has(whId)) index.set(whId, new Map());
    index.get(whId).set(String(row.day_of_week || '').toLowerCase(), String(row.note || '').trim());
  }
  return index;
}

/**
 * Legacy working_hours row stores hours per day for a week ending on week_ending (Sunday).
 * Expand into individual day entries for V2 time entries.
 */
function expandSqlWorkingHoursRow(row, dailyNotesIndex = new Map()) {
  if (coerceBool(row.is_deleted)) return [];

  const legacyId = Number(row.id);
  const weekEnding = coerceDate(row.week_ending);
  if (!weekEnding) return [];

  const notesForRow = dailyNotesIndex.get(legacyId) || new Map();
  const entries = [];

  for (let index = 0; index < DAY_FIELDS.length; index += 1) {
    const dayKey = DAY_FIELDS[index];
    const minutes = hoursToMinutes(row[dayKey]);
    if (!minutes) continue;

    const entryDate = new Date(weekEnding);
    entryDate.setUTCDate(entryDate.getUTCDate() - (6 - index));
    entryDate.setUTCHours(12, 0, 0, 0);

    const note = notesForRow.get(dayKey) || null;

    entries.push({
      legacyWorkingHoursId: legacyId,
      legacyUserId: row.user_id !== null && row.user_id !== undefined ? Number(row.user_id) : null,
      legacyProjectId: row.project_id !== null && row.project_id !== undefined ? Number(row.project_id) : null,
      legacyTaskId: row.task_id !== null && row.task_id !== undefined ? Number(row.task_id) : null,
      dayKey,
      dayIndex: index,
      entryDate,
      minutes,
      description: note,
      approvedDate: coerceDate(row.approved_date),
      createdAt: coerceDate(row.created_at),
      updatedAt: coerceDate(row.updated_at),
      verified: coerceBool(row.verified),
      submitted: coerceBool(row.submit),
    });
  }

  return entries;
}

function buildTimeEntryPayload({
  timeWeekId,
  projectId,
  assignmentId,
  userId,
  budgetId,
  workCategoryId,
  entry,
}) {
  return {
    timeWeekId,
    projectId,
    assignmentId,
    userId,
    budgetId: budgetId || null,
    taskId: null,
    workCategoryId,
    entryDate: entry.entryDate,
    startTime: null,
    endTime: null,
    minutes: entry.minutes,
    title: null,
    description: entry.description || null,
    source: 'manual',
    status: 'approved',
    isLocked: true,
    lockedAt: entry.approvedDate || entry.updatedAt || new Date(),
    billable: true,
    approvedAt: entry.approvedDate || entry.updatedAt || new Date(),
    approvedBy: null,
    isDeleted: false,
    deletedAt: null,
  };
}

function buildTimeWeekPayload({ userId, weekStartDate, weekEndDate, latestEntryDate, approvedDate }) {
  const submittedAt = latestEntryDate || approvedDate || new Date();
  return {
    userId,
    weekStartDate,
    weekEndDate,
    status: 'approved',
    totalMinutes: 0,
    totalEntries: 0,
    submittedAt,
    approvedAt: approvedDate || submittedAt,
    approvedBy: null,
    isDeleted: false,
    deletedAt: null,
  };
}

module.exports = {
  buildDailyNotesIndex,
  expandSqlWorkingHoursRow,
  buildTimeEntryPayload,
  buildTimeWeekPayload,
};
