const { getTimeEntryModel } = require('../models/timeEntry.model');
const mongoose = require('mongoose');

function castObjectId(value) {
  if (value == null || value === '') return value;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const asString = String(value);
  if (mongoose.isValidObjectId(asString)) {
    return new mongoose.Types.ObjectId(asString);
  }
  return value;
}

function buildEntryQuery(filters = {}) {
  const query = { isDeleted: false };
  if (filters.timeWeekId) query.timeWeekId = castObjectId(filters.timeWeekId);
  if (filters.projectId) query.projectId = castObjectId(filters.projectId);
  if (filters.assignmentId) query.assignmentId = castObjectId(filters.assignmentId);
  if (filters.userId) query.userId = castObjectId(filters.userId);
  if (filters.budgetId) query.budgetId = castObjectId(filters.budgetId);
  if (filters.status) query.status = filters.status;
  if (filters.statuses) query.status = { $in: filters.statuses };
  if (filters.excludeEntryId) query._id = { $ne: castObjectId(filters.excludeEntryId) };
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

async function findByTimerId(timerId) {
  if (!timerId) return null;
  return getTimeEntryModel().findOne({ timerId, isDeleted: false }).exec();
}

async function listEntries(filters = {}, options = {}) {
  const TimeEntry = getTimeEntryModel();
  const sort = options.sort || { entryDate: 1, createdAt: 1 };
  let query = TimeEntry.find(buildEntryQuery(filters)).sort(sort);

  if (options.select) query = query.select(options.select);
  if (options.lean) query = query.lean();
  if (options.limit) query = query.limit(Number(options.limit));
  if (options.skip) query = query.skip(Number(options.skip));

  return query.exec();
}

/** Aggregate minutes by week for project summary — avoids loading full entry documents. */
async function aggregateWeekTotals(filters = {}) {
  const TimeEntry = getTimeEntryModel();
  const rows = await TimeEntry.aggregate([
    { $match: buildEntryQuery(filters) },
    {
      $group: {
        _id: '$timeWeekId',
        totalMinutes: { $sum: '$minutes' },
        draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, '$minutes', 0] } },
        submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, '$minutes', 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$minutes', 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, '$minutes', 0] } },
      },
    },
  ]);

  return rows.map((row) => ({
    timeWeekId: row._id,
    totalMinutes: Number(row.totalMinutes || 0),
    statusTotals: {
      draft: Number(row.draft || 0),
      submitted: Number(row.submitted || 0),
      approved: Number(row.approved || 0),
      rejected: Number(row.rejected || 0),
    },
  }));
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

async function sumActiveMinutesByAssignmentIds(assignmentIds = []) {
  if (!assignmentIds.length) return new Map();

  const TimeEntry = getTimeEntryModel();
  const rows = await TimeEntry.aggregate([
    {
      $match: {
        assignmentId: { $in: assignmentIds.map((id) => castObjectId(id)) },
        isDeleted: false,
        status: { $in: ['draft', 'submitted', 'approved'] },
      },
    },
    {
      $group: {
        _id: '$assignmentId',
        totalMinutes: { $sum: '$minutes' },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), Number(row.totalMinutes || 0)]));
}

async function sumActiveMinutesForUserAndProjects(userId, projectIds = []) {
  if (!userId || !projectIds.length) return 0;

  const TimeEntry = getTimeEntryModel();
  const rows = await TimeEntry.aggregate([
    {
      $match: {
        userId: castObjectId(userId),
        projectId: { $in: projectIds.map((id) => castObjectId(id)) },
        isDeleted: false,
        status: { $in: ['draft', 'submitted', 'approved'] },
      },
    },
    { $group: { _id: null, totalMinutes: { $sum: '$minutes' } } },
  ]);
  return Number(rows[0]?.totalMinutes || 0);
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
  findByTimerId,
  listEntries,
  aggregateWeekTotals,
  createEntry,
  updateEntry,
  updateManyByWeek,
  softDeleteEntry,
  sumMinutes,
  sumMinutesByWeek,
  sumActiveMinutesByAssignmentIds,
  sumActiveMinutesForUserAndProjects,
  sumMinutesForCap,
  countActiveEntriesForProject,
};
