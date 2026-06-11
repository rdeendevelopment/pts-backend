const { getDailyFlowCatchupModel } = require('../models/dailyFlowCatchup.model');

function buildActiveQuery(filters = {}) {
  const query = { isDeleted: false };

  if (filters.accountId) query.accountId = filters.accountId;
  if (filters.dayKey) query.dayKey = filters.dayKey;
  if (filters.dayId) query.dayId = filters.dayId;
  if (filters.type) query.type = filters.type;
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

async function findCatchupById(id, accountId) {
  const Catchup = getDailyFlowCatchupModel();
  return Catchup.findOne({ _id: id, accountId, isDeleted: false }).lean();
}

async function listCatchups(filters = {}, { limit = 50, skip = 0 } = {}) {
  const Catchup = getDailyFlowCatchupModel();
  const query = buildActiveQuery(filters);

  const [items, total] = await Promise.all([
    Catchup.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Catchup.countDocuments(query),
  ]);

  return { items, total };
}

async function createCatchup(payload) {
  const Catchup = getDailyFlowCatchupModel();
  const doc = await Catchup.create(payload);
  return doc.toObject();
}

async function updateCatchupById(id, accountId, updates) {
  const Catchup = getDailyFlowCatchupModel();
  return Catchup.findOneAndUpdate(
    { _id: id, accountId, isDeleted: false },
    { $set: updates },
    { new: true }
  ).lean();
}

async function softDeleteCatchupById(id, accountId) {
  const Catchup = getDailyFlowCatchupModel();
  return Catchup.findOneAndUpdate(
    { _id: id, accountId, isDeleted: false },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        status: 'archived',
      },
    },
    { new: true }
  ).lean();
}

async function countCatchups(filters = {}) {
  const Catchup = getDailyFlowCatchupModel();
  return Catchup.countDocuments(buildActiveQuery(filters));
}

module.exports = {
  findCatchupById,
  listCatchups,
  createCatchup,
  updateCatchupById,
  softDeleteCatchupById,
  countCatchups,
};
