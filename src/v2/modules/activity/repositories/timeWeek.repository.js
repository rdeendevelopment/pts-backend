const { getTimeWeekModel } = require('../models/timeWeek.model');

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

async function listWeeks(filters = {}) {
  const TimeWeek = getTimeWeekModel();
  const query = { isDeleted: false };
  if (filters.userId) query.userId = filters.userId;
  if (filters.status) query.status = filters.status;
  if (filters.statuses?.length) query.status = { $in: filters.statuses };
  if (filters.weekStartDate) query.weekStartDate = new Date(filters.weekStartDate);
  if (filters.weekStartDateFrom || filters.weekStartDateTo) {
    query.weekStartDate = {};
    if (filters.weekStartDateFrom) query.weekStartDate.$gte = new Date(filters.weekStartDateFrom);
    if (filters.weekStartDateTo) query.weekStartDate.$lte = new Date(filters.weekStartDateTo);
  }
  return TimeWeek.find(query).sort({ weekStartDate: -1 }).exec();
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
  listWeeks,
  createWeek,
  updateWeek,
  recalculateWeekTotals,
};
