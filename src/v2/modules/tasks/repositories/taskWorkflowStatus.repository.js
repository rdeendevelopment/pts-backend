const { getTaskWorkflowStatusModel } = require('../models/taskWorkflowStatus.model');

async function listByWorkflowId(workflowId, { activeOnly = true } = {}) {
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  const query = { workflowId };
  if (activeOnly) query.status = 'active';
  return TaskWorkflowStatus.find(query).sort({ order: 1 }).exec();
}

async function findById(statusId, { workflowId = null, activeOnly = false } = {}) {
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  const query = { _id: statusId };
  if (workflowId) query.workflowId = workflowId;
  if (activeOnly) query.status = 'active';
  return TaskWorkflowStatus.findOne(query).exec();
}

async function createMany(rows) {
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  return TaskWorkflowStatus.insertMany(rows);
}

async function createStatus(payload) {
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  return TaskWorkflowStatus.create(payload);
}

async function updateStatus(statusId, workflowId, payload) {
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  return TaskWorkflowStatus.findOneAndUpdate(
    { _id: statusId, workflowId, status: 'active' },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function findActiveDuplicateName(workflowId, name, excludeStatusId = null) {
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  const query = {
    workflowId,
    status: 'active',
    name: { $regex: new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  };
  if (excludeStatusId) query._id = { $ne: excludeStatusId };
  return TaskWorkflowStatus.findOne(query).exec();
}

async function findActiveDuplicateKey(workflowId, key, excludeStatusId = null) {
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  const query = { workflowId, status: 'active', key: String(key).toLowerCase() };
  if (excludeStatusId) query._id = { $ne: excludeStatusId };
  return TaskWorkflowStatus.findOne(query).exec();
}

async function countActiveByWorkflowId(workflowId) {
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  return TaskWorkflowStatus.countDocuments({ workflowId, status: 'active' });
}

async function archiveStatus(statusId, workflowId) {
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  return TaskWorkflowStatus.findOneAndUpdate(
    { _id: statusId, workflowId, status: 'active' },
    { $set: { status: 'inactive' } },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function updateOrders(workflowId, updates = []) {
  const TaskWorkflowStatus = getTaskWorkflowStatusModel();
  await Promise.all(updates.map(({ statusId, order }) => TaskWorkflowStatus.updateOne(
    { _id: statusId, workflowId, status: 'active' },
    { $set: { order } }
  )));
  return listByWorkflowId(workflowId, { activeOnly: true });
}

module.exports = {
  listByWorkflowId,
  findById,
  createMany,
  createStatus,
  updateStatus,
  findActiveDuplicateName,
  findActiveDuplicateKey,
  countActiveByWorkflowId,
  archiveStatus,
  updateOrders,
};
