const { getTaskModel } = require('../models/task.model');

async function findById(taskId, { projectId = null, includeDeleted = false } = {}) {
  const Task = getTaskModel();
  const query = { _id: taskId };
  if (projectId) query.projectId = projectId;
  if (!includeDeleted) query.isDeleted = false;
  return Task.findOne(query).exec();
}

function buildProjectTaskQuery(projectId, filters = {}) {
  const query = { projectId, isDeleted: false };
  if (filters.status) query.status = filters.status;
  if (filters.statusNe) query.status = { $ne: filters.statusNe };
  if (filters.workflowStatusId) query.workflowStatusId = filters.workflowStatusId;
  if (filters.assigneeUserId) query['assignees.userId'] = filters.assigneeUserId;
  if (filters.priority) query.priority = filters.priority;

  if (filters.search) {
    const term = String(filters.search).trim();
    if (term) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ title: regex }, { description: regex }];
    }
  }

  return query;
}

async function listByProject(projectId, filters = {}) {
  const Task = getTaskModel();
  const query = buildProjectTaskQuery(projectId, filters);

  return Task.find(query).sort({ workflowOrder: 1, createdAt: 1 }).exec();
}

async function listByProjectPage(projectId, filters = {}, { skip = 0, limit = 100 } = {}) {
  const Task = getTaskModel();
  const query = buildProjectTaskQuery(projectId, filters);

  const [items, total] = await Promise.all([
    Task.find(query).sort({ workflowOrder: 1, createdAt: 1 }).skip(skip).limit(limit).exec(),
    Task.countDocuments(query),
  ]);

  return { items, total };
}

async function createTask(payload) {
  const Task = getTaskModel();
  return Task.create(payload);
}

async function updateTask(taskId, payload) {
  const Task = getTaskModel();
  return Task.findOneAndUpdate(
    { _id: taskId, isDeleted: false },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function findMaxOrder(projectId, workflowStatusId, excludeTaskId = null) {
  const Task = getTaskModel();
  const query = { projectId, workflowStatusId, isDeleted: false };
  if (excludeTaskId) query._id = { $ne: excludeTaskId };
  return Task.findOne(query).sort({ workflowOrder: -1 }).select('workflowOrder').lean();
}

async function findMaxTaskNumber(projectId) {
  const Task = getTaskModel();
  return Task.findOne({ projectId, isDeleted: false })
    .sort({ taskNumber: -1 })
    .select('taskNumber')
    .lean();
}

async function incrementCommentCount(taskId, delta = 1) {
  const Task = getTaskModel();
  return Task.findOneAndUpdate(
    { _id: taskId, isDeleted: false },
    { $inc: { commentCount: delta } },
    { returnDocument: 'after' }
  ).exec();
}

async function pushAttachment(taskId, attachment, { updatedBy = null } = {}) {
  const Task = getTaskModel();
  const update = { $push: { attachments: attachment } };
  if (updatedBy) update.$set = { updatedBy };
  return Task.findOneAndUpdate(
    { _id: taskId, isDeleted: false },
    update,
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function removeAttachment(taskId, attachmentId, { updatedBy = null } = {}) {
  const Task = getTaskModel();
  const task = await Task.findOne({ _id: taskId, isDeleted: false }).exec();
  if (!task) return null;

  const sub = task.attachments.id(attachmentId);
  if (!sub) return null;

  const removed = {
    attachmentId: String(sub._id),
    fileUrl: sub.fileUrl,
  };

  sub.deleteOne();
  if (updatedBy) task.updatedBy = updatedBy;
  await task.save();

  return { task, removed };
}

async function countByProject(projectId, { status = null, statusNe = null, overdue = false } = {}) {
  const Task = getTaskModel();
  const query = { projectId, isDeleted: false };
  if (status) query.status = status;
  if (statusNe) query.status = { $ne: statusNe };
  if (overdue) {
    query.status = 'active';
    query.dueDate = { $lt: new Date() };
  }
  return Task.countDocuments(query);
}

async function countByWorkflowStatusId(workflowStatusId) {
  const Task = getTaskModel();
  return Task.countDocuments({
    workflowStatusId,
    isDeleted: false,
    status: { $ne: 'archived' },
  });
}

async function moveTasksBetweenStatuses(fromStatusId, toStatusId) {
  const Task = getTaskModel();
  return Task.updateMany(
    { workflowStatusId: fromStatusId, isDeleted: false },
    { $set: { workflowStatusId: toStatusId } }
  );
}

function buildAggregateQuery(filters = {}) {
  const root = { isDeleted: false };
  const andParts = [root];

  if (filters.statusNe) {
    root.status = { $ne: filters.statusNe };
  } else if (filters.status) {
    root.status = filters.status;
  } else if (filters.baseStatus) {
    root.status = filters.baseStatus;
  }

  if (filters.projectId) root.projectId = filters.projectId;
  if (filters.priority) root.priority = filters.priority;

  if (filters.dueDateFrom || filters.dueDateTo) {
    root.dueDate = {};
    if (filters.dueDateFrom) root.dueDate.$gte = filters.dueDateFrom;
    if (filters.dueDateTo) root.dueDate.$lte = filters.dueDateTo;
  }

  if (filters.search) {
    const term = String(filters.search).trim();
    if (term) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      andParts.push({
        $or: [{ title: regex }, { description: regex }],
      });
    }
  }

  if (filters.relevanceOr?.length) {
    andParts.push({ $or: filters.relevanceOr });
  }

  return andParts.length === 1 ? andParts[0] : { $and: andParts };
}

async function listAggregate(filters = {}, { sort = { updatedAt: -1 }, skip = 0, limit = 100 } = {}) {
  const Task = getTaskModel();
  const query = buildAggregateQuery(filters);

  const [items, total] = await Promise.all([
    Task.find(query).sort(sort).skip(skip).limit(limit).exec(),
    Task.countDocuments(query).exec(),
  ]);

  return { items, total };
}

async function hardDeleteById(taskId) {
  const Task = getTaskModel();
  return Task.findByIdAndDelete(taskId).exec();
}

module.exports = {
  findById,
  listByProject,
  listByProjectPage,
  createTask,
  updateTask,
  findMaxOrder,
  findMaxTaskNumber,
  incrementCommentCount,
  pushAttachment,
  removeAttachment,
  countByProject,
  countByWorkflowStatusId,
  moveTasksBetweenStatuses,
  buildAggregateQuery,
  listAggregate,
  hardDeleteById,
};
