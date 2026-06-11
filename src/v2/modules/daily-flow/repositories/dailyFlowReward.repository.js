const { getDailyFlowRewardModel } = require('../models/dailyFlowReward.model');

function buildActiveQuery(filters = {}) {
  const query = { isDeleted: false };

  if (filters.accountId) query.accountId = filters.accountId;
  if (filters.dayKey) query.dayKey = filters.dayKey;
  if (filters.dayId) query.dayId = filters.dayId;
  if (filters.type) query.type = filters.type;
  if (filters.ruleKey) query.ruleKey = filters.ruleKey;
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

async function findRewardByRule(accountId, dayKey, ruleKey) {
  const Reward = getDailyFlowRewardModel();
  return Reward.findOne({
    accountId,
    dayKey,
    ruleKey,
    isDeleted: false,
  }).lean();
}

async function listRewards(filters = {}, { limit = 50, skip = 0 } = {}) {
  const Reward = getDailyFlowRewardModel();
  const query = buildActiveQuery(filters);

  const [items, total] = await Promise.all([
    Reward.find(query).sort({ earnedAt: -1 }).skip(skip).limit(limit).lean(),
    Reward.countDocuments(query),
  ]);

  return { items, total };
}

async function createReward(payload) {
  const Reward = getDailyFlowRewardModel();
  const doc = await Reward.create(payload);
  return doc.toObject();
}

async function countRewards(filters = {}) {
  const Reward = getDailyFlowRewardModel();
  return Reward.countDocuments(buildActiveQuery(filters));
}

async function countDistinctRewardCandidates(filters = {}) {
  const Reward = getDailyFlowRewardModel();
  const query = buildActiveQuery(filters);
  const rows = await Reward.distinct('accountId', query);
  return rows.length;
}

module.exports = {
  findRewardByRule,
  listRewards,
  createReward,
  countRewards,
  countDistinctRewardCandidates,
};
