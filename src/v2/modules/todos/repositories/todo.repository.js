const { getTodoModel } = require('../models/todo.model');
const { getProjectModel } = require('../../projects/models/project.model');
const { getTaskModel } = require('../../tasks/models/task.model');
const { getTaskWorkflowStatusModel } = require('../../tasks/models/taskWorkflowStatus.model');
const { getAccountModel } = require('../../auth/models/account.model');
const { Types } = require('mongoose');

function mongoId(value) {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(String(value));
}

function legacyHistory(fallbackAt) {
  return {
    $cond: [
      { $gt: [{ $size: { $ifNull: ['$planningHistory', []] } }, 0] },
      '$planningHistory',
      [{
        plannedDate: { $ifNull: ['$currentPlannedDate', '$todoDate'] },
        addedAt: { $ifNull: ['$createdAt', fallbackAt] },
        source: { $cond: [{ $ne: [{ $ifNull: ['$linkedTaskId', null] }, null] }, 'added_from_task', 'created'] },
        carriedFromDate: null, movedAt: null, movedBy: null, movedToDate: null,
        statusAtDayEnd: 'pending', completedAt: null,
      }],
    ],
  };
}

function activeQuery(filters = {}) {
  const query = { isDeleted: false };
  if (filters.createdBy) query.createdBy = filters.createdBy;
  if (filters.projectId === null) query.projectId = null;
  else if (filters.projectId) query.projectId = filters.projectId;
  const legacyDate = { todoDate: filters.todoDate, $or: [{ planningHistory: { $exists: false } }, { planningHistory: { $size: 0 } }] };
  if (filters.todoDate) query.$or = [
    { planningHistory: { $elemMatch: { plannedDate: filters.todoDate } } },
    legacyDate,
  ];
  if (filters.status === 'overdue') {
    query.$or = [
      { planningHistory: { $elemMatch: { plannedDate: filters.todoDate, statusAtDayEnd: { $ne: 'completed' } } } },
      { ...legacyDate, status: 'pending' },
    ];
    query.deadline = { $lt: filters.now || new Date() };
  } else if (filters.status === 'completed') {
    query.$or = [
      { planningHistory: { $elemMatch: { plannedDate: filters.todoDate, statusAtDayEnd: 'completed' } } },
      { ...legacyDate, status: 'completed' },
    ];
  } else if (filters.status === 'pending') {
    query.$or = [
      { planningHistory: { $elemMatch: { plannedDate: filters.todoDate, statusAtDayEnd: { $in: ['pending', 'moved_forward'] } } } },
      { ...legacyDate, status: 'pending' },
    ];
  }
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
  // Populate must not depend on a best-effort bootstrap having registered refs first.
  getProjectModel();
  getTaskModel();
  getTaskWorkflowStatusModel();
  getAccountModel();
  return query
    .populate('projectId', 'name code isDeleted')
    .populate({ path: 'linkedTaskId', select: 'title projectId workflowStatusId status dueDate isDeleted', populate: { path: 'workflowStatusId', select: 'name category color isTerminal status' } })
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

async function carryForward(id, accountId, { fromDate, toDate, movedAt, movedBy }) {
  const movedById = mongoId(movedBy);
  await getTodoModel().findOneAndUpdate(
    {
      _id: id, createdBy: accountId, isDeleted: false, status: 'pending',
      'planningHistory.plannedDate': { $ne: toDate },
    },
    [{ $set: {
      todoDate: toDate,
      firstPlannedDate: { $ifNull: ['$firstPlannedDate', '$todoDate'] },
      currentPlannedDate: toDate,
      sourceType: { $ifNull: ['$sourceType', { $cond: [{ $ne: [{ $ifNull: ['$linkedTaskId', null] }, null] }, 'task', 'personal'] }] },
      carryForwardCount: { $add: [{ $ifNull: ['$carryForwardCount', 0] }, 1] },
      planningHistory: {
        $concatArrays: [
          { $map: { input: legacyHistory(movedAt), as: 'entry', in: {
            $cond: [
              { $eq: ['$$entry.plannedDate', fromDate] },
              { $mergeObjects: ['$$entry', { statusAtDayEnd: 'moved_forward', movedAt, movedBy: movedById, movedToDate: toDate }] },
              '$$entry',
            ],
          } } },
          [{ plannedDate: toDate, addedAt: movedAt, source: 'carried_forward', carriedFromDate: fromDate, movedAt: null, movedBy: null, movedToDate: null, statusAtDayEnd: 'pending', completedAt: null }],
        ],
      },
    } }],
    { returnDocument: 'after', updatePipeline: true }
  );
  return findById(id, accountId, { ownerOnly: true });
}

async function mergeCarryForward(source, target, accountId, { fromDate, toDate, movedAt, movedBy }) {
  const sourceHistory = (source.planningHistory || []).map((entry) => entry.plannedDate === fromDate
    ? { ...entry, statusAtDayEnd: 'moved_forward', movedAt, movedBy, movedToDate: toDate }
    : entry);
  await getTodoModel().updateOne(
    { _id: target._id, createdBy: accountId, isDeleted: false },
    {
      $min: { firstPlannedDate: source.firstPlannedDate || fromDate },
      $max: { carryForwardCount: Number(source.carryForwardCount || 0) + 1 },
      $addToSet: {
        planningHistory: { $each: sourceHistory },
        completionEvents: { $each: source.completionEvents || [] },
      },
    }
  );
  await softDelete(source._id, accountId);
  return findById(target._id, accountId, { ownerOnly: true });
}

async function complete(id, accountId, { completedAt, completedBy, plannedDate, extra = {} }) {
  const completedById = mongoId(completedBy);
  await getTodoModel().findOneAndUpdate(
    { _id: id, createdBy: accountId, isDeleted: false, status: 'pending' },
    [{ $set: {
      status: 'completed', completedAt, completedBy: completedById,
      firstPlannedDate: { $ifNull: ['$firstPlannedDate', '$todoDate'] },
      currentPlannedDate: { $ifNull: ['$currentPlannedDate', '$todoDate'] },
      sourceType: { $ifNull: ['$sourceType', { $cond: [{ $ne: [{ $ifNull: ['$linkedTaskId', null] }, null] }, 'task', 'personal'] }] },
      carryForwardCount: { $ifNull: ['$carryForwardCount', 0] },
      planningHistory: { $map: { input: legacyHistory(completedAt), as: 'entry', in: {
        $cond: [
          { $eq: ['$$entry.plannedDate', plannedDate] },
          { $mergeObjects: ['$$entry', { statusAtDayEnd: 'completed', completedAt }] },
          '$$entry',
        ],
      } } },
      completionEvents: { $concatArrays: [{ $ifNull: ['$completionEvents', []] }, [{ completedAt, completedBy: completedById, plannedDate, reopenedAt: null, reopenedBy: null }]] },
      ...extra,
    } }],
    { returnDocument: 'after', updatePipeline: true }
  );
  return findById(id, accountId, { ownerOnly: true });
}

async function reopen(id, accountId, { reopenedAt, reopenedBy, plannedDate }) {
  const reopenedById = mongoId(reopenedBy);
  await getTodoModel().findOneAndUpdate(
    { _id: id, createdBy: accountId, isDeleted: false, status: 'completed' },
    [{ $set: {
      status: 'pending', completedAt: null, completedBy: null,
      planningHistory: { $map: { input: { $ifNull: ['$planningHistory', []] }, as: 'entry', in: {
        $cond: [
          { $and: [{ $eq: ['$$entry.plannedDate', plannedDate] }, { $eq: ['$$entry.statusAtDayEnd', 'completed'] }] },
          { $mergeObjects: ['$$entry', { statusAtDayEnd: 'pending', completedAt: null }] },
          '$$entry',
        ],
      } } },
      completionEvents: { $map: { input: { $ifNull: ['$completionEvents', []] }, as: 'event', in: {
        $cond: [
          { $eq: [{ $ifNull: ['$$event.reopenedAt', null] }, null] },
          { $mergeObjects: ['$$event', { reopenedAt, reopenedBy: reopenedById }] },
          '$$event',
        ],
      } } },
    } }],
    { returnDocument: 'after', updatePipeline: true }
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

async function findActiveLinked(createdBy, linkedTaskId, todoDate) {
  return withDetails(getTodoModel().findOne({ createdBy, linkedTaskId, todoDate, isDeleted: false })).lean();
}

async function upsertLinked(payload) {
  const filter = { createdBy: payload.createdBy, linkedTaskId: payload.linkedTaskId, todoDate: payload.todoDate, isDeleted: false };
  await getTodoModel().updateOne(filter, { $setOnInsert: payload }, { upsert: true, runValidators: true });
  return withDetails(getTodoModel().findOne(filter)).lean();
}

async function listOutstanding(createdBy, beforeDate, { page = 1, limit = 50 } = {}) {
  const query = { createdBy, status: 'pending', isDeleted: false, $or: [
    { currentPlannedDate: { $lt: beforeDate } },
    { todoDate: { $lt: beforeDate }, $or: [{ currentPlannedDate: { $exists: false } }, { currentPlannedDate: null }] },
  ] };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    withDetails(getTodoModel().find(query).sort({ todoDate: 1, priorityRank: 1, createdAt: 1 }).skip(skip).limit(limit)).lean(),
    getTodoModel().countDocuments(query),
  ]);
  return { items, total };
}

async function listAllOutstanding(createdBy, beforeDate) {
  return withDetails(getTodoModel().find({ createdBy, status: 'pending', isDeleted: false, $or: [
    { currentPlannedDate: { $lt: beforeDate } },
    { todoDate: { $lt: beforeDate }, $or: [{ currentPlannedDate: { $exists: false } }, { currentPlannedDate: null }] },
  ] }).sort({ currentPlannedDate: 1, todoDate: 1, createdAt: 1 })).lean();
}

async function listOutstandingOnDate(createdBy, date) {
  return withDetails(getTodoModel().find({
    createdBy, isDeleted: false,
    $or: [
      { firstPlannedDate: { $lt: date } },
      { todoDate: { $lt: date }, $or: [{ firstPlannedDate: { $exists: false } }, { firstPlannedDate: null }] },
    ],
  }).sort({ firstPlannedDate: 1, todoDate: 1, createdAt: 1 })).lean();
}

function normalizeSummary(rows) {
  return rows[0] || { total: 0, completed: 0, pending: 0, highPriority: 0 };
}

async function summary(filters) {
  const Todo = getTodoModel();
  const base = activeQuery(filters);
  delete base.status;
  const rows = await Todo.aggregate([
    { $match: base },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
      highPriority: { $sum: { $cond: [{ $and: [{ $eq: ['$priority', 'high'] }, { $eq: ['$status', 'pending'] }] }, 1, 0] } },
    } },
  ]);
  return normalizeSummary(rows);
}

async function listForReport(createdBy, startDate, endDate) {
  const query = {
    isDeleted: false,
    $or: [
      { planningHistory: { $elemMatch: { plannedDate: { $gte: startDate, $lte: endDate } } } },
      { todoDate: { $gte: startDate, $lte: endDate }, $or: [{ planningHistory: { $exists: false } }, { planningHistory: { $size: 0 } }] },
    ],
  };
  if (createdBy) query.createdBy = createdBy;
  return getTodoModel().find(query).sort({ firstPlannedDate: 1, _id: 1 }).lean();
}

module.exports = { activeQuery, sortSpec, create, findById, list, update, carryForward, mergeCarryForward, complete, reopen, softDelete, summary, normalizeSummary, findActiveLinked, upsertLinked, listOutstanding, listAllOutstanding, listOutstandingOnDate, listForReport };
