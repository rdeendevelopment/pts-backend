const { getTimeEntryModel } = require('../models/timeEntry.model');

function buildEntryQuery(filters = {}) {
  const query = { isDeleted: false };
  if (filters.timeWeekId) query.timeWeekId = filters.timeWeekId;
  if (filters.projectId) query.projectId = filters.projectId;
  if (filters.assignmentId) query.assignmentId = filters.assignmentId;
  if (filters.userId) query.userId = filters.userId;
  if (filters.budgetId) query.budgetId = filters.budgetId;
  if (filters.status) query.status = filters.status;
  if (filters.statuses) query.status = { $in: filters.statuses };
  if (filters.excludeEntryId) query._id = { $ne: filters.excludeEntryId };
  if (filters.entryDateFrom || filters.entryDateTo) {
    query.entryDate = {};
    if (filters.entryDateFrom) query.entryDate.$gte = filters.entryDateFrom;
    if (filters.entryDateTo) query.entryDate.$lte = filters.entryDateTo;
  }
  return query;
}

async function findById(entryId, { includeDeleted = false } = {}) {
  const TimeEntry = getTimeEntryModel();
  const query = { _id: entryId };
  if (!includeDeleted) query.isDeleted = false;
  return TimeEntry.findOne(query).exec();
}

async function listEntries(filters = {}) {
  const TimeEntry = getTimeEntryModel();
  return TimeEntry.find(buildEntryQuery(filters)).sort({ entryDate: 1, createdAt: 1 }).exec();
}

async function createEntry(payload, session = null) {
  const TimeEntry = getTimeEntryModel();
  const docs = await TimeEntry.create([payload], session ? { session } : undefined);
  return docs[0];
}

async function updateEntry(entryId, payload, session = null, { expectedStatus = null } = {}) {
  const TimeEntry = getTimeEntryModel();
  const query = { _id: entryId, isDeleted: false };
  if (expectedStatus) query.status = expectedStatus;

  const options = { returnDocument: 'after', runValidators: true };
  if (session) options.session = session;

  return TimeEntry.findOneAndUpdate(query, { $set: payload }, options).exec();
}

async function updateManyByWeek(weekId, payload, session = null, { statuses = null } = {}) {
  const TimeEntry = getTimeEntryModel();
  const query = { timeWeekId: weekId, isDeleted: false };
  if (statuses) query.status = { $in: statuses };

  const options = {};
  if (session) options.session = session;

  return getTimeEntryModel().updateMany(query, { $set: payload }, options).exec();
}

async function softDeleteEntry(entryId, updatedBy, session = null) {
  const TimeEntry = getTimeEntryModel();
  const options = { returnDocument: 'after' };
  if (session) options.session = session;

  return TimeEntry.findOneAndUpdate(
    { _id: entryId, isDeleted: false, status: 'draft', isLocked: false },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        updatedBy,
      },
    },
    options
  ).exec();
}

async function sumMinutes(filters = {}, session = null) {
  const TimeEntry = getTimeEntryModel();
  const query = buildEntryQuery(filters);
  const pipeline = [
    { $match: query },
    {
      $group: {
        _id: null,
        totalMinutes: { $sum: '$minutes' },
        totalEntries: { $sum: 1 },
      },
    },
  ];

  const aggOptions = session ? { session } : {};
  const rows = await TimeEntry.aggregate(pipeline, aggOptions);
  return {
    totalMinutes: rows[0]?.totalMinutes || 0,
    totalEntries: rows[0]?.totalEntries || 0,
  };
}

async function sumMinutesByWeek(weekId, { statuses = null, session = null } = {}) {
  return sumMinutes({ timeWeekId: weekId, statuses }, session);
}

async function sumMinutesForCap({
  assignmentId,
  userId,
  projectId = null,
  entryDateFrom = null,
  entryDateTo = null,
  statuses,
  excludeEntryId = null,
}) {
  return sumMinutes({
    assignmentId,
    userId,
    projectId,
    entryDateFrom,
    entryDateTo,
    statuses,
    excludeEntryId,
  });
}

async function countActiveEntriesForProject(projectId) {
  const TimeEntry = getTimeEntryModel();
  return TimeEntry.countDocuments({
    projectId,
    isDeleted: false,
    status: { $in: ['draft', 'submitted', 'approved'] },
  }).exec();
}

module.exports = {
  buildEntryQuery,
  findById,
  listEntries,
  createEntry,
  updateEntry,
  updateManyByWeek,
  softDeleteEntry,
  sumMinutes,
  sumMinutesByWeek,
  sumMinutesForCap,
  countActiveEntriesForProject,
};
