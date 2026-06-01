const { getProjectModel } = require('../models/project.model');

function buildListQuery(filters = {}) {
  const query = {};

  if (!filters.includeDeleted) query.isDeleted = false;
  if (filters.clientId) query.clientId = filters.clientId;
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;
  if (filters.billingType) query.billingType = filters.billingType;
  if (filters.priority) query.priority = filters.priority;
  if (filters.tag) query.tags = String(filters.tag).trim().toLowerCase();
  if (filters.projectIds?.length) query._id = { $in: filters.projectIds };

  if (filters.search) {
    const term = String(filters.search).trim();
    if (term) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { name: regex },
        { code: regex },
        { description: regex },
      ];
    }
  }

  return query;
}

async function listProjects(filters = {}, { limit = 20, cursor = null } = {}) {
  const Project = getProjectModel();
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

  const rows = await Project.find(query)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1] : null;

  return { items, nextCursor, hasMore };
}

async function findById(projectId, { includeDeleted = false } = {}) {
  const Project = getProjectModel();
  const query = { _id: projectId };
  if (!includeDeleted) query.isDeleted = false;
  return Project.findOne(query).exec();
}

async function findByClientAndNormalizedName(clientId, normalizedName, { includeDeleted = false } = {}) {
  const Project = getProjectModel();
  const query = {
    clientId,
    normalizedName: String(normalizedName).trim().toLowerCase(),
  };
  if (!includeDeleted) query.isDeleted = false;
  return Project.findOne(query).exec();
}

async function findByCode(code, { includeDeleted = false } = {}) {
  const Project = getProjectModel();
  const query = { code: String(code).trim().toUpperCase() };
  if (!includeDeleted) query.isDeleted = false;
  return Project.findOne(query).exec();
}

async function countActiveByClientId(clientId) {
  const Project = getProjectModel();
  return Project.countDocuments({
    clientId,
    isDeleted: false,
    status: { $in: ['draft', 'active', 'on_hold'] },
  }).exec();
}

async function createProject(payload) {
  const Project = getProjectModel();
  return Project.create(payload);
}

async function updateProject(projectId, payload) {
  const Project = getProjectModel();
  return Project.findOneAndUpdate(
    { _id: projectId, isDeleted: false },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function softDeleteProject(projectId, updatedBy) {
  const Project = getProjectModel();
  return Project.findOneAndUpdate(
    { _id: projectId, isDeleted: false },
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

async function listRetainerProjectsForAutoRenewal() {
  const Project = getProjectModel();
  return Project.find({
    type: 'retainer',
    status: 'active',
    isDeleted: false,
    autoCreateMonthlyBudget: { $ne: false },
    retainerHoursPerMonth: { $gte: 1 },
  }).exec();
}

module.exports = {
  listProjects,
  findById,
  findByClientAndNormalizedName,
  findByCode,
  countActiveByClientId,
  createProject,
  updateProject,
  softDeleteProject,
  listRetainerProjectsForAutoRenewal,
};
