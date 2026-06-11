const { getUserModel } = require('../models/user.model');

function buildListQuery(filters = {}) {
  const query = { isDeleted: false };

  if (filters.status) query.status = filters.status;
  if (filters.department) query.department = String(filters.department).trim();
  if (filters.employmentType) query.employmentType = filters.employmentType;
  if (filters.managerId) query.managerId = filters.managerId;
  if (filters.excludeAccountIds?.length) {
    query.accountId = { $nin: filters.excludeAccountIds };
  }

  if (filters.search) {
    const term = String(filters.search).trim();
    if (term) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { displayName: regex },
        { username: regex },
        { email: regex },
      ];
    }
  }

  return query;
}

async function listUsers(filters = {}, { limit = 20, cursor = null } = {}) {
  const User = getUserModel();
  const baseQuery = buildListQuery(filters);
  const conditions = [baseQuery];

  if (cursor?.createdAt && cursor?.id) {
    conditions.push({
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ],
    });
  }

  const query = conditions.length === 1 ? conditions[0] : { $and: conditions };

  const rows = await User.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1] : null;

  return { items, nextCursor, hasMore };
}

async function listUsersPage(filters = {}, { limit = 20, skip = 0, sort = { createdAt: -1, _id: -1 } } = {}) {
  const User = getUserModel();
  const query = buildListQuery(filters);

  const [items, total] = await Promise.all([
    User.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  return { items, total };
}

async function findById(userId) {
  const User = getUserModel();
  return User.findOne({ _id: userId, isDeleted: false }).exec();
}

async function findByAccountId(accountId) {
  const User = getUserModel();
  return User.findOne({ accountId, isDeleted: false }).exec();
}

async function findByEmail(email) {
  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized) return null;

  const User = getUserModel();
  return User.findOne({
    email: normalized,
    isDeleted: false,
  }).exec();
}

async function findByUsername(username) {
  const normalized = String(username || '').toLowerCase().trim();
  if (!normalized) return null;

  const User = getUserModel();
  return User.findOne({
    username: normalized,
    isDeleted: false,
  }).exec();
}

async function findActiveByUsername(username) {
  const normalized = String(username || '').toLowerCase().trim();
  if (!normalized) return null;

  const User = getUserModel();
  return User.findOne({
    username: normalized,
    isDeleted: false,
    status: 'active',
  }).exec();
}

async function createUser(payload) {
  const User = getUserModel();
  return User.create(payload);
}

async function updateUser(userId, payload) {
  const User = getUserModel();
  return User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function softDeleteUser(userId) {
  const User = getUserModel();
  return User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date(), status: 'inactive' } },
    { returnDocument: 'after' }
  ).exec();
}

async function countActiveDirectReports(userId) {
  const User = getUserModel();
  return User.countDocuments({
    managerId: userId,
    isDeleted: false,
    status: 'active',
  });
}

async function clearManagerForDirectReports(userId) {
  const User = getUserModel();
  return User.updateMany(
    { managerId: userId, isDeleted: false },
    { $set: { managerId: null } }
  );
}

module.exports = {
  listUsers,
  listUsersPage,
  findById,
  findByAccountId,
  findByEmail,
  findByUsername,
  findActiveByUsername,
  createUser,
  updateUser,
  softDeleteUser,
  countActiveDirectReports,
  clearManagerForDirectReports,
};
