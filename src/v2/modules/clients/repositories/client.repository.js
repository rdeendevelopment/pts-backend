const { getClientModel } = require('../models/client.model');

function buildListQuery(filters = {}) {
  const query = {};

  if (!filters.includeDeleted) query.isDeleted = false;
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.industry) query.industry = String(filters.industry).trim();
  if (filters.tag) query.tags = String(filters.tag).trim().toLowerCase();

  if (filters.search) {
    const term = String(filters.search).trim();
    if (term) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { name: regex },
        { code: regex },
        { email: regex },
        { industry: regex },
      ];
    }
  }

  return query;
}

async function listClients(filters = {}, { limit = 20, cursor = null } = {}) {
  const Client = getClientModel();
  const baseQuery = buildListQuery(filters);
  const conditions = [baseQuery];

  if (cursor?.updatedAt && cursor?.id) {
    conditions.push({
      $or: [
        { updatedAt: { $lt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
      ],
    });
  }

  const query = conditions.length === 1 ? conditions[0] : { $and: conditions };

  const rows = await Client.find(query)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1] : null;

  return { items, nextCursor, hasMore };
}

async function listClientsPage(filters = {}, { limit = 20, skip = 0, sort = { updatedAt: -1, _id: -1 } } = {}) {
  const Client = getClientModel();
  const query = buildListQuery(filters);

  const [items, total] = await Promise.all([
    Client.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Client.countDocuments(query),
  ]);

  return { items, total };
}

async function findById(clientId, { includeDeleted = false } = {}) {
  const Client = getClientModel();
  const query = { _id: clientId };
  if (!includeDeleted) query.isDeleted = false;
  return Client.findOne(query).exec();
}

async function findByIds(clientIds = [], { includeDeleted = false } = {}) {
  if (!clientIds.length) return [];

  const Client = getClientModel();
  const query = { _id: { $in: clientIds } };
  if (!includeDeleted) query.isDeleted = false;

  return Client.find(query)
    .select('name status type primaryContact')
    .lean();
}

async function findByNormalizedName(normalizedName, { includeDeleted = false } = {}) {
  const Client = getClientModel();
  const query = { normalizedName: String(normalizedName).trim().toLowerCase() };
  if (!includeDeleted) query.isDeleted = false;
  return Client.findOne(query).exec();
}

async function findByCode(code, { includeDeleted = false } = {}) {
  const Client = getClientModel();
  const query = { code: String(code).trim().toUpperCase() };
  if (!includeDeleted) query.isDeleted = false;
  return Client.findOne(query).exec();
}

async function createClient(payload) {
  const Client = getClientModel();
  return Client.create(payload);
}

async function updateClient(clientId, payload) {
  const Client = getClientModel();
  return Client.findOneAndUpdate(
    { _id: clientId, isDeleted: false },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function softDeleteClient(clientId, updatedBy) {
  const Client = getClientModel();
  return Client.findOneAndUpdate(
    { _id: clientId, isDeleted: false },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        status: 'archived',
        updatedBy,
      },
    },
    { returnDocument: 'after' }
  ).exec();
}

module.exports = {
  listClients,
  listClientsPage,
  findById,
  findByIds,
  findByNormalizedName,
  findByCode,
  createClient,
  updateClient,
  softDeleteClient,
};
