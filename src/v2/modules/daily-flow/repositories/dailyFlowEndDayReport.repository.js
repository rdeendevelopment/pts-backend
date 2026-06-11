const { getDailyFlowEndDayReportModel } = require('../models/dailyFlowEndDayReport.model');

function buildActiveQuery(filters = {}) {
  const query = { isDeleted: false };
  if (filters.accountId) query.accountId = filters.accountId;
  if (filters.userId) query.userId = filters.userId;
  if (filters.dayKey) query.dayKey = filters.dayKey;
  if (filters.status) query.status = filters.status;
  if (filters.fromDayKey || filters.toDayKey) {
    query.dayKey = query.dayKey || {};
    if (filters.fromDayKey) query.dayKey.$gte = filters.fromDayKey;
    if (filters.toDayKey) query.dayKey.$lte = filters.toDayKey;
  }
  return query;
}

async function findByAccountAndDayKey(accountId, dayKey) {
  const Report = getDailyFlowEndDayReportModel();
  return Report.findOne(buildActiveQuery({ accountId, dayKey })).lean();
}

async function findByUserAndDayKey(userId, dayKey) {
  const Report = getDailyFlowEndDayReportModel();
  return Report.findOne(buildActiveQuery({ userId, dayKey })).lean();
}

async function upsertReport(accountId, dayKey, payload) {
  const Report = getDailyFlowEndDayReportModel();
  return Report.findOneAndUpdate(
    { accountId, dayKey, isDeleted: false },
    { $set: payload },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
}

async function listReports(filters = {}, { limit = 50, skip = 0, sort = { submittedAt: -1 } } = {}) {
  const Report = getDailyFlowEndDayReportModel();
  const query = buildActiveQuery(filters);
  const [items, total] = await Promise.all([
    Report.find(query).sort(sort).skip(skip).limit(limit).lean(),
    Report.countDocuments(query),
  ]);
  return { items, total };
}

module.exports = {
  findByAccountAndDayKey,
  findByUserAndDayKey,
  upsertReport,
  listReports,
};
