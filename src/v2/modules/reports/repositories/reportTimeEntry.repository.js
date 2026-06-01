const { getTimeEntryModel } = require('../../activity/models/timeEntry.model');

function buildReportEntryMatch(filters = {}) {
  const match = { isDeleted: false };

  if (filters.userId) match.userId = filters.userId;
  if (filters.userIds?.length) match.userId = { $in: filters.userIds };
  if (filters.projectId) match.projectId = filters.projectId;
  if (filters.projectIds?.length) match.projectId = { $in: filters.projectIds };
  if (filters.workCategoryId) match.workCategoryId = filters.workCategoryId;
  if (filters.taskId) match.taskId = filters.taskId;
  if (filters.statuses?.length) match.status = { $in: filters.statuses };

  if (filters.entryDateFrom || filters.entryDateTo) {
    match.entryDate = {};
    if (filters.entryDateFrom) match.entryDate.$gte = filters.entryDateFrom;
    if (filters.entryDateTo) match.entryDate.$lte = filters.entryDateTo;
  }

  return match;
}

async function aggregateEntryTotals(filters = {}) {
  const TimeEntry = getTimeEntryModel();
  const match = buildReportEntryMatch(filters);
  const rows = await TimeEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalMinutes: { $sum: '$minutes' },
        totalEntries: { $sum: 1 },
      },
    },
  ]);

  return {
    totalMinutes: rows[0]?.totalMinutes || 0,
    totalEntries: rows[0]?.totalEntries || 0,
  };
}

async function listEntriesForReport(filters = {}, { skip = 0, limit = 50 } = {}) {
  const TimeEntry = getTimeEntryModel();
  const match = buildReportEntryMatch(filters);

  const [items, total] = await Promise.all([
    TimeEntry.find(match)
      .sort({ entryDate: 1, createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    TimeEntry.countDocuments(match).exec(),
  ]);

  return { items, total };
}

async function listAllEntriesForReport(filters = {}) {
  const TimeEntry = getTimeEntryModel();
  return TimeEntry.find(buildReportEntryMatch(filters))
    .sort({ entryDate: 1, createdAt: 1 })
    .lean()
    .exec();
}

module.exports = {
  buildReportEntryMatch,
  aggregateEntryTotals,
  listEntriesForReport,
  listAllEntriesForReport,
};
