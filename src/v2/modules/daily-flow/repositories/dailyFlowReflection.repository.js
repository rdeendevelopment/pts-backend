const { getDailyFlowReflectionModel } = require('../models/dailyFlowReflection.model');

function buildActiveQuery(filters = {}) {
  const query = { isDeleted: false };

  if (filters.accountId) query.accountId = filters.accountId;
  if (filters.dayKey) query.dayKey = filters.dayKey;

  if (filters.fromDayKey || filters.toDayKey) {
    query.dayKey = query.dayKey || {};
    if (filters.fromDayKey) query.dayKey.$gte = filters.fromDayKey;
    if (filters.toDayKey) query.dayKey.$lte = filters.toDayKey;
  }

  if (filters.dayKeys?.length) {
    query.dayKey = { $in: filters.dayKeys };
  }

  if (filters.hasBlockers) {
    query.blockers = { $nin: [null, ''] };
  }

  return query;
}

async function findReflectionByAccountAndDayKey(accountId, dayKey) {
  const Reflection = getDailyFlowReflectionModel();
  return Reflection.findOne({ accountId, dayKey, isDeleted: false }).lean();
}

async function upsertReflection(accountId, dayKey, payload) {
  const Reflection = getDailyFlowReflectionModel();
  return Reflection.findOneAndUpdate(
    { accountId, dayKey, isDeleted: false },
    { $set: payload },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

async function countReflections(filters = {}) {
  const Reflection = getDailyFlowReflectionModel();
  return Reflection.countDocuments(buildActiveQuery(filters));
}

async function countReflectionsWithBlockers(filters = {}) {
  const Reflection = getDailyFlowReflectionModel();
  return Reflection.countDocuments(buildActiveQuery({ ...filters, hasBlockers: true }));
}

module.exports = {
  findReflectionByAccountAndDayKey,
  upsertReflection,
  countReflections,
  countReflectionsWithBlockers,
};
