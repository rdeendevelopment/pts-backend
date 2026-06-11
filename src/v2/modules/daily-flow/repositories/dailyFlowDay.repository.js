const { getDailyFlowDayModel } = require('../models/dailyFlowDay.model');

function buildActiveQuery(filters = {}) {
  const query = { isDeleted: false };

  if (filters.accountId) query.accountId = filters.accountId;
  if (filters.dayKey) query.dayKey = filters.dayKey;
  if (filters.status) query.status = filters.status;

  if (filters.fromDayKey || filters.toDayKey) {
    query.dayKey = query.dayKey || {};
    if (filters.fromDayKey) query.dayKey.$gte = filters.fromDayKey;
    if (filters.toDayKey) query.dayKey.$lte = filters.toDayKey;
  }

  if (filters.dayKeys?.length) {
    query.dayKey = { $in: filters.dayKeys };
  }

  return query;
}

async function findDayByAccountAndKey(accountId, dayKey) {
  const Day = getDailyFlowDayModel();
  return Day.findOne({ accountId, dayKey, isDeleted: false }).lean();
}

async function findOrCreateDay(accountId, dayKey, defaults = {}) {
  const Day = getDailyFlowDayModel();

  try {
    return await Day.findOneAndUpdate(
      { accountId, dayKey, isDeleted: false },
      {
        $setOnInsert: {
          accountId,
          dayKey,
          userId: defaults.userId || null,
          timezone: defaults.timezone,
          status: defaults.status || 'active',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (err) {
    if (err?.code === 11000) {
      return Day.findOne({ accountId, dayKey, isDeleted: false }).lean();
    }
    throw err;
  }
}

async function listDays(filters = {}, { limit = 20, skip = 0 } = {}) {
  const Day = getDailyFlowDayModel();
  const query = buildActiveQuery(filters);

  const [items, total] = await Promise.all([
    Day.find(query).sort({ dayKey: -1 }).skip(skip).limit(limit).lean(),
    Day.countDocuments(query),
  ]);

  return { items, total };
}

async function updateDayByAccountAndKey(accountId, dayKey, updates) {
  const Day = getDailyFlowDayModel();
  return Day.findOneAndUpdate(
    { accountId, dayKey, isDeleted: false },
    { $set: updates },
    { new: true }
  ).lean();
}

async function countDistinctAccounts(filters = {}) {
  const Day = getDailyFlowDayModel();
  const query = buildActiveQuery(filters);
  const rows = await Day.distinct('accountId', query);
  return rows.length;
}

module.exports = {
  findDayByAccountAndKey,
  findOrCreateDay,
  listDays,
  updateDayByAccountAndKey,
  countDistinctAccounts,
};
