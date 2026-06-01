const { minutesToHours } = require('../helpers/formatting.helper');

function toReportUserSummary(user) {
  if (!user) return null;
  const doc = user.toObject ? user.toObject() : user;
  return {
    id: String(doc._id),
    displayName: doc.displayName,
    email: doc.email,
    department: doc.department || null,
    jobTitle: doc.jobTitle || null,
  };
}

function toReportProjectSummary(project) {
  if (!project) return null;
  const doc = project.toObject ? project.toObject() : project;
  return {
    id: String(doc._id),
    name: doc.name,
    code: doc.code || null,
    clientId: String(doc.clientId),
    status: doc.status,
  };
}

function toReportClientSummary(client) {
  if (!client) return null;
  const doc = client.toObject ? client.toObject() : client;
  return {
    id: String(doc._id),
    name: doc.name,
    code: doc.code || null,
    status: doc.status,
  };
}

function toReportEntryDto(entry) {
  if (!entry) return null;
  const doc = entry.toObject ? entry.toObject() : entry;
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    projectId: String(doc.projectId),
    assignmentId: String(doc.assignmentId),
    budgetId: doc.budgetId ? String(doc.budgetId) : null,
    taskId: doc.taskId ? String(doc.taskId) : null,
    workCategoryId: String(doc.workCategoryId),
    entryDate: doc.entryDate,
    minutes: doc.minutes,
    totalHours: minutesToHours(doc.minutes),
    source: doc.source,
    status: doc.status,
    description: doc.description || null,
  };
}

function toDateRangeDto(dateRange) {
  return {
    period: dateRange.period,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    weekStartDay: dateRange.weekStartDay,
    timeZone: dateRange.timeZone,
  };
}

function toReportTotals(totalMinutes, totalEntries = null) {
  return {
    totalMinutes,
    totalHours: minutesToHours(totalMinutes),
    totalEntries: totalEntries,
  };
}

function toWeekApprovalRow(week, user = null) {
  const doc = week.toObject ? week.toObject() : week;
  return {
    weekId: String(doc._id),
    user: user ? toReportUserSummary(user) : { id: String(doc.userId) },
    weekStartDate: doc.weekStartDate,
    weekEndDate: doc.weekEndDate,
    status: doc.status,
    totalMinutes: doc.totalMinutes,
    totalEntries: doc.totalEntries,
    submittedAt: doc.submittedAt,
    approvedAt: doc.approvedAt,
    rejectedAt: doc.rejectedAt,
  };
}

module.exports = {
  toReportUserSummary,
  toReportProjectSummary,
  toReportClientSummary,
  toReportEntryDto,
  toDateRangeDto,
  toReportTotals,
  toWeekApprovalRow,
};
