const { getTodoModel } = require('../models/todo.model');

function activeQuery(filters = {}) {
  const query = { isDeleted: false };
  if (filters.createdBy) query.createdBy = filters.createdBy;
  if (filters.projectId === null) query.projectId = null;
  else if (filters.projectId) query.projectId = filters.projectId;
  if (filters.todoDate) query.todoDate = filters.todoDate;
  if (filters.status === 'overdue') {
    query.status = 'pending';
    query.deadline = { $lt: filters.now || new Date() };
  } else if (filters.status) query.status = filters.status;
  if (filters.priority) query.priority = filters.priority;
  return query;
}

function sortSpec(sort = 'newest') {
  if (sort === 'oldest') return { createdAt: 1, _id: 1 };
  if (sort === 'deadline') return { hasDeadline: -1, deadline: 1, createdAt: -1 };
  if (sort === 'priority') return { priorityRank: 1, createdAt: -1 };
  if (sort === 'project') return { projectName: 1, createdAt: -1 };
  return { createdAt: -1, _id: -1 };
}

function withDetails(query) {
  return query
    .populate('projectId', 'name code isDeleted')
    .populate('linkedTaskId', 'title projectId isDeleted')
    .populate('createdBy', 'firstName lastName email');
}

async function create(payload) {
  const doc = await getTodoModel().create(payload);
  return findById(doc._id, payload.createdBy, { ownerOnly: true });
}

async function findById(id, accountId, { ownerOnly = true } = {}) {
  const query = { _id: id, isDeleted: false };
  if (ownerOnly) query.createdBy = accountId;
  return withDetails(getTodoModel().findOne(query)).lean();
}

async function list(filters, { page = 1, limit = 50, sort = 'newest' } = {}) {
  const query = activeQuery(filters);
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    withDetails(getTodoModel().find(query).sort(sortSpec(sort)).skip(skip).limit(limit)).lean(),
    getTodoModel().countDocuments(query),
  ]);
  return { items, total };
}

async function update(id, accountId, updates) {
  await getTodoModel().findOneAndUpdate(
    { _id: id, createdBy: accountId, isDeleted: false },
    { $set: updates },
    { runValidators: true }
  );
  return findById(id, accountId, { ownerOnly: true });
}

async function softDelete(id, accountId) {
  return getTodoModel().findOneAndUpdate(
    { _id: id, createdBy: accountId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true }
  ).lean();
}

async function summary(filters) {
  const Todo = getTodoModel();
  const base = activeQuery(filters);
  delete base.status;
  const [rows] = await Todo.aggregate([
    { $match: base },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
      highPriority: { $sum: { $cond: [{ $and: [{ $eq: ['$priority', 'high'] }, { $eq: ['$status', 'pending'] }] }, 1, 0] } },
    } },
  ]);
  return rows[0] || { total: 0, completed: 0, pending: 0, highPriority: 0 };
}

module.exports = { activeQuery, sortSpec, create, findById, list, update, softDelete, summary };
