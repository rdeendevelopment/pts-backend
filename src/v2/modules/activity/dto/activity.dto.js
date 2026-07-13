function toTimeWeekDto(week) {
  if (!week) return null;
  const doc = week.toObject ? week.toObject() : week;
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    weekStartDate: doc.weekStartDate,
    weekEndDate: doc.weekEndDate,
    timezone: doc.timezone,
    status: doc.status,
    totalMinutes: doc.totalMinutes,
    totalEntries: doc.totalEntries,
    submittedAt: doc.submittedAt,
    submittedBy: doc.submittedBy ? String(doc.submittedBy) : null,
    approvedAt: doc.approvedAt,
    approvedBy: doc.approvedBy ? String(doc.approvedBy) : null,
    rejectedAt: doc.rejectedAt,
    rejectedBy: doc.rejectedBy ? String(doc.rejectedBy) : null,
    rejectionReason: doc.rejectionReason,
    lockedAt: doc.lockedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toTimeEntryDto(entry) {
  if (!entry) return null;
  const doc = entry.toObject ? entry.toObject() : entry;
  return {
    id: String(doc._id),
    timeWeekId: String(doc.timeWeekId),
    projectId: String(doc.projectId),
    projectName: doc.projectName || null,
    assignmentId: String(doc.assignmentId),
    userId: String(doc.userId),
    budgetId: doc.budgetId ? String(doc.budgetId) : null,
    taskId: doc.taskId ? String(doc.taskId) : null,
    taskName: doc.taskName || null,
    workCategoryId: String(doc.workCategoryId),
    workCategoryName: doc.workCategoryName || null,
    entryDate: doc.entryDate,
    startTime: doc.startTime,
    endTime: doc.endTime,
    minutes: doc.minutes,
    title: doc.title,
    description: doc.description,
    source: doc.source,
    status: doc.status,
    isLocked: doc.isLocked,
    lockedAt: doc.lockedAt,
    billable: doc.billable,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toActiveTimerDto(timer) {
  if (!timer) return null;
  const doc = timer.toObject ? timer.toObject() : timer;
  return {
    id: String(doc._id),
    clientId: doc.clientId ? String(doc.clientId) : null,
    projectId: String(doc.projectId),
    assignmentId: String(doc.assignmentId),
    userId: String(doc.userId),
    budgetId: doc.budgetId ? String(doc.budgetId) : null,
    taskId: doc.taskId ? String(doc.taskId) : null,
    taskKey: doc.taskKey || (doc.taskId ? String(doc.taskId) : 'NO_TASK'),
    workCategoryId: String(doc.workCategoryId),
    startedAt: doc.startedAt,
    sessionStartedAt: doc.sessionStartedAt || doc.startedAt,
    accumulatedSeconds: doc.accumulatedSeconds || 0,
    pausedAt: doc.pausedAt || null,
    stoppedAt: doc.stoppedAt,
    description: doc.description,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toWorkCategoryDto(category) {
  if (!category) return null;
  const doc = category.toObject ? category.toObject() : category;
  return {
    id: String(doc._id),
    name: doc.name,
    code: doc.code,
    description: doc.description,
    color: doc.color,
    icon: doc.icon,
    status: doc.status,
    isDefault: doc.isDefault,
    sortOrder: doc.sortOrder,
  };
}

function buildWeeklyReport(entries = [], { weekStartDate, timezone } = {}) {
  const { buildWeekDayKeys, formatDayKey } = require('../helpers/week.helper');
  const dayKeys = weekStartDate ? buildWeekDayKeys(weekStartDate, timezone) : null;
  const days = new Map();

  if (dayKeys) {
    for (const dayKey of dayKeys) {
      days.set(dayKey, { date: dayKey, projects: new Map(), totalMinutes: 0 });
    }
  }

  for (const entry of entries) {
    const dayKey = formatDayKey(entry.entryDate, timezone);
    if (!days.has(dayKey)) {
      if (dayKeys) {
        continue;
      }
      days.set(dayKey, { date: dayKey, projects: new Map(), totalMinutes: 0 });
    }
    const day = days.get(dayKey);
    const projectKey = String(entry.projectId);
    if (!day.projects.has(projectKey)) {
      day.projects.set(projectKey, { projectId: projectKey, totalMinutes: 0, entries: [] });
    }
    const project = day.projects.get(projectKey);
    project.totalMinutes += Number(entry.minutes || 0);
    project.entries.push(toTimeEntryDto(entry));
    day.totalMinutes += Number(entry.minutes || 0);
  }

  const orderedDayKeys = dayKeys || [...days.keys()].sort((a, b) => a.localeCompare(b));
  const groupedDays = orderedDayKeys.map((dayKey) => {
    const day = days.get(dayKey) || { date: dayKey, projects: new Map(), totalMinutes: 0 };
    return {
      date: day.date,
      totalMinutes: day.totalMinutes,
      projects: [...day.projects.values()],
    };
  });

  const weeklyTotalMinutes = groupedDays.reduce((sum, day) => sum + day.totalMinutes, 0);

  return { days: groupedDays, weeklyTotalMinutes };
}

module.exports = {
  toTimeWeekDto,
  toTimeEntryDto,
  toActiveTimerDto,
  toWorkCategoryDto,
  buildWeeklyReport,
};
