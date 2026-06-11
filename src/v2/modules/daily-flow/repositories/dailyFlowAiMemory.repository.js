const { getDailyFlowAiMemoryModel } = require('../models/dailyFlowAiMemory.model');

function buildActiveQuery(filters = {}) {
  const query = { isDeleted: false };
  if (filters.accountId) query.accountId = filters.accountId;
  if (filters.userId) query.userId = filters.userId;
  if (filters.dayKey) query.dayKey = filters.dayKey;
  if (filters.type) query.type = filters.type;
  if (filters.event) query.event = filters.event;
  if (filters.cacheKey) query.cacheKey = filters.cacheKey;
  return query;
}

async function createMemory(payload) {
  const Memory = getDailyFlowAiMemoryModel();
  const doc = await Memory.create(payload);
  return doc.toObject();
}

async function findLatestByType(accountId, dayKey, type, event = null) {
  const Memory = getDailyFlowAiMemoryModel();
  const filters = { accountId, dayKey, type };
  if (event) filters.event = event;
  return Memory.findOne(buildActiveQuery(filters))
    .sort({ createdAt: -1 })
    .lean();
}

async function findLatestByCacheKey(accountId, dayKey, type, cacheKey) {
  const Memory = getDailyFlowAiMemoryModel();
  return Memory.findOne(buildActiveQuery({ accountId, dayKey, type, cacheKey }))
    .sort({ createdAt: -1 })
    .lean();
}

async function listMemories(filters = {}, { limit = 20, skip = 0 } = {}) {
  const Memory = getDailyFlowAiMemoryModel();
  const query = buildActiveQuery(filters);
  const [items, total] = await Promise.all([
    Memory.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Memory.countDocuments(query),
  ]);
  return { items, total };
}

module.exports = {
  createMemory,
  findLatestByType,
  findLatestByCacheKey,
  listMemories,
};
