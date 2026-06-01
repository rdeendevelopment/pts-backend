const { buildSourceHash } = require('../helpers/migrationBase.helper');
const { mapEntrySource } = require('../helpers/enumMaps.helper');

function transformLegacyTimeWeek(doc, userId) {
  if (!userId) {
    return { error: { code: 'MISSING_USER_MAP', message: 'Time week user could not be resolved.' } };
  }

  return {
    payload: {
      userId,
      weekStartDate: doc.weekStartDate,
      weekEndDate: doc.weekEndDate,
      status: doc.status || 'draft',
      totalMinutes: Number(doc.totalMinutes || 0),
      submittedAt: doc.submittedAt || null,
      approvedAt: doc.approvedAt || null,
      rejectionReason: doc.rejectionReason || null,
      isDeleted: false,
    },
    sourceHash: buildSourceHash(doc, 'time_weeks'),
    legacyId: doc.legacyId ?? null,
    oldObjectId: doc._id,
  };
}

function transformLegacyTimeEntry(doc, refs) {
  const minutes = Math.max(1, Number(doc.durationMinutes || 0));
  const { timeWeekId, projectId, assignmentId, userId, budgetId, taskId, workCategoryId } = refs;

  if (!timeWeekId || !projectId || !assignmentId || !userId || !workCategoryId) {
    return {
      error: {
        code: 'MISSING_ASSIGNMENT',
        message: 'Time entry required references could not be resolved.',
      },
    };
  }

  return {
    payload: {
      timeWeekId,
      projectId,
      assignmentId,
      userId,
      budgetId: budgetId || null,
      taskId: taskId || null,
      workCategoryId,
      entryDate: doc.entryDate,
      startTime: doc.startTime || null,
      endTime: doc.endTime || null,
      minutes,
      description: doc.description || null,
      source: mapEntrySource(doc.entryType),
      status: doc.status || 'draft',
      billable: doc.isBillable !== false,
      isDeleted: false,
    },
    sourceHash: buildSourceHash(doc, 'time_entries'),
    legacyId: doc.legacyId ?? null,
    oldObjectId: doc._id,
  };
}

const DAY_FIELDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function expandWorkingHoursRows(doc) {
  const rows = [];
  if (!doc.weekEnding) return rows;

  const weekEnd = new Date(doc.weekEnding);
  for (let index = 0; index < DAY_FIELDS.length; index += 1) {
    const hours = Number(doc[DAY_FIELDS[index]] || 0);
    if (!hours) continue;

    const entryDate = new Date(weekEnd);
    entryDate.setDate(entryDate.getDate() - (6 - index));

    rows.push({
      _id: `${String(doc._id)}:${DAY_FIELDS[index]}`,
      legacyId: doc.legacyId,
      userId: doc.userId,
      projectId: doc.projectId,
      taskId: doc.taskId || null,
      entryDate,
      durationMinutes: Math.max(1, Math.round(hours * 60)),
      description: doc.notes?.find((n) => n.dayOfWeek === DAY_FIELDS[index])?.note || null,
      entryType: 'add-activity',
      status: doc.submit ? 'submitted' : 'draft',
      isBillable: true,
      sourceCollection: 'working_hours',
      parentObjectId: doc._id,
      dayKey: DAY_FIELDS[index],
    });
  }
  return rows;
}

module.exports = {
  transformLegacyTimeWeek,
  transformLegacyTimeEntry,
  expandWorkingHoursRows,
  DAY_FIELDS,
};
