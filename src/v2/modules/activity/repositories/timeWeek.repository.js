const { getTimeWeekModel } = require('../models/timeWeek.model');
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

function buildWeekListQuery(filters = {}) {
  const query = { isDeleted: false };
  if (filters.userId) query.userId = castObjectId(filters.userId);
  if (filters.status) query.status = filters.status;
  if (filters.statuses?.length) query.status = { $in: filters.statuses };
  if (filters.weekStartDate) query.weekStartDate = new Date(filters.weekStartDate);
  if (filters.weekStartDateFrom || filters.weekStartDateTo) {
    query.weekStartDate = {};
    if (filters.weekStartDateFrom) query.weekStartDate.$gte = new Date(filters.weekStartDateFrom);
    if (filters.weekStartDateTo) query.weekStartDate.$lte = new Date(filters.weekStartDateTo);
  }
  return query;
}

async function findById(weekId, { includeDeleted = false } = {}) {
  const TimeWeek = getTimeWeekModel();
  const query = { _id: weekId };
  if (!includeDeleted) query.isDeleted = false;
  return TimeWeek.findOne(query).exec();
}

async function findByUserAndWeekStart(userId, weekStartDate, { includeDeleted = false } = {}) {
  const TimeWeek = getTimeWeekModel();
  const query = { userId, weekStartDate: new Date(weekStartDate) };
  if (!includeDeleted) query.isDeleted = false;
  return TimeWeek.findOne(query).exec();
}

async function findByIds(weekIds = []) {
  if (!weekIds.length) return [];
  const TimeWeek = getTimeWeekModel();
  return TimeWeek.find({ _id: { $in: weekIds }, isDeleted: false }).lean();
}

async function listWeeks(filters = {}, options = {}) {
  const TimeWeek = getTimeWeekModel();
  const query = buildWeekListQuery(filters);

  const limit = Number(options.limit) > 0 ? Number(options.limit) : null;
  const page = Number(options.page) > 0 ? Number(options.page) : 1;
  const skip = limit ? (page - 1) * limit : 0;

  let findQuery = TimeWeek.find(query).sort({ weekStartDate: -1 });
  if (options.lean !== false) findQuery = findQuery.lean();
  if (options.select) findQuery = findQuery.select(options.select);
  if (limit) findQuery = findQuery.skip(skip).limit(limit);

  if (!limit) {
    return findQuery.exec();
  }

  const [items, total] = await Promise.all([
    findQuery.exec(),
    TimeWeek.countDocuments(query).exec(),
  ]);

  return { items, total, page, limit };
}

async function summarizeWeeks(filters = {}) {
  const TimeWeek = getTimeWeekModel();
  const query = buildWeekListQuery(filters);

  const rows = await TimeWeek.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        weekCount: { $sum: 1 },
        totalMinutes: { $sum: '$totalMinutes' },
        draftCount: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
        submittedCount: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
        approvedCount: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        rejectedCount: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
      },
    },
  ]);

  const row = rows[0] || {};
  return {
    weekCount: Number(row.weekCount || 0),
    totalMinutes: Number(row.totalMinutes || 0),
    draftCount: Number(row.draftCount || 0),
    submittedCount: Number(row.submittedCount || 0),
    approvedCount: Number(row.approvedCount || 0),
    rejectedCount: Number(row.rejectedCount || 0),
  };
}

async function createWeek(payload, session = null) {
  const TimeWeek = getTimeWeekModel();
  const docs = await TimeWeek.create([payload], session ? { session } : undefined);
  return docs[0];
}

async function updateWeek(weekId, payload, session = null, { expectedStatus = null } = {}) {
  const TimeWeek = getTimeWeekModel();
  const query = { _id: weekId, isDeleted: false };
  if (expectedStatus) query.status = expectedStatus;

  const options = { returnDocument: 'after', runValidators: true };
  if (session) options.session = session;

  return TimeWeek.findOneAndUpdate(query, { $set: payload }, options).exec();
}

async function recalculateWeekTotals(weekId, session = null) {
  const timeEntryRepository = require('./timeEntry.repository');
  const totals = await timeEntryRepository.sumMinutesByWeek(weekId, {
    statuses: ['draft', 'submitted', 'approved'],
    session,
  });
  return updateWeek(
    weekId,
    {
      totalMinutes: totals.totalMinutes,
      totalEntries: totals.totalEntries,
    },
    session
  );
}

module.exports = {
  findById,
  findByUserAndWeekStart,
  findByIds,
  listWeeks,
  summarizeWeeks,
  createWeek,
  updateWeek,
  recalculateWeekTotals,
};
