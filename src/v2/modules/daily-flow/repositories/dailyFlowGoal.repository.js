const { getDailyFlowGoalModel } = require('../models/dailyFlowGoal.model');

function buildActiveQuery(filters = {}) {
  const query = { isDeleted: false };

  if (filters.accountId) query.accountId = filters.accountId;
  if (filters.dayKey) query.dayKey = filters.dayKey;
  if (filters.dayId) query.dayId = filters.dayId;
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  if (filters.isPrivate !== undefined) query.isPrivate = filters.isPrivate;

  if (filters.fromDayKey || filters.toDayKey) {
    query.dayKey = query.dayKey || {};
    if (filters.fromDayKey) query.dayKey.$gte = filters.fromDayKey;
    if (filters.toDayKey) query.dayKey.$lte = filters.toDayKey;
  }

  if (filters.dayKeys?.length) {
    query.dayKey = { $in: filters.dayKeys };
  }

  if (filters.excludeDeletedStatus) {
    query.status = { $ne: 'deleted' };
  }

  if (filters.sourceType) query.sourceType = filters.sourceType;
  if (filters.sourceId) query.sourceId = filters.sourceId;
  if (filters.linkedTaskId) query.linkedTaskId = filters.linkedTaskId;

  return query;
}

async function findGoalByLinkedTask(accountId, dayKey, linkedTaskId) {
  const Goal = getDailyFlowGoalModel();
  return Goal.findOne({
    accountId,
    dayKey,
    linkedTaskId,
    isDeleted: false,
    status: { $ne: 'deleted' },
  }).lean();
}

async function findGoalById(id, accountId) {
  const Goal = getDailyFlowGoalModel();
  return Goal.findOne({ _id: id, accountId, isDeleted: false }).lean();
}

async function listGoals(filters = {}, { limit = 50, skip = 0 } = {}) {
  const Goal = getDailyFlowGoalModel();
  const query = buildActiveQuery(filters);

  const [items, total] = await Promise.all([
    Goal.find(query).sort({ sortOrder: 1, createdAt: 1 }).skip(skip).limit(limit).lean(),
    Goal.countDocuments(query),
  ]);

  return { items, total };
}

async function createGoal(payload) {
  const Goal = getDailyFlowGoalModel();
  const doc = await Goal.create(payload);
  return doc.toObject();
}

async function updateGoalById(id, accountId, updates) {
  const Goal = getDailyFlowGoalModel();
  return Goal.findOneAndUpdate(
    { _id: id, accountId, isDeleted: false },
    { $set: updates },
    { new: true }
  ).lean();
}

async function softDeleteGoalById(id, accountId) {
  const Goal = getDailyFlowGoalModel();
  return Goal.findOneAndUpdate(
    { _id: id, accountId, isDeleted: false },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        status: 'deleted',
      },
    },
    { new: true }
  ).lean();
}

async function countGoals(filters = {}) {
  const Goal = getDailyFlowGoalModel();
  return Goal.countDocuments(buildActiveQuery(filters));
}

async function countDistinctAccountsWithCompletedWorkGoals(filters = {}) {
  const Goal = getDailyFlowGoalModel();
  const query = buildActiveQuery({
    ...filters,
    type: 'work',
    status: 'completed',
    excludeDeletedStatus: true,
  });
  const rows = await Goal.distinct('accountId', query);
  return rows.length;
}

module.exports = {
  findGoalById,
  findGoalByLinkedTask,
  listGoals,
  createGoal,
  updateGoalById,
  softDeleteGoalById,
  countGoals,
  countDistinctAccountsWithCompletedWorkGoals,
};
