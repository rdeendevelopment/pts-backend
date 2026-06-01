const { getTaskCollaboratorModel } = require('../models/taskCollaborator.model');

async function listActiveByTaskId(taskId) {
  const TaskCollaborator = getTaskCollaboratorModel();
  return TaskCollaborator.find({ taskId, isActive: true }).sort({ createdAt: 1 }).exec();
}

async function findByTaskAndUser(taskId, userId) {
  const TaskCollaborator = getTaskCollaboratorModel();
  return TaskCollaborator.findOne({ taskId, userId }).exec();
}

async function findActiveByTaskAndUser(taskId, userId) {
  const TaskCollaborator = getTaskCollaboratorModel();
  return TaskCollaborator.findOne({ taskId, userId, isActive: true }).exec();
}

async function upsertActive({ taskId, projectId, userId, accessType, addedBy }) {
  const TaskCollaborator = getTaskCollaboratorModel();
  return TaskCollaborator.findOneAndUpdate(
    { taskId, userId },
    {
      $set: {
        projectId,
        accessType,
        isActive: true,
        addedBy,
      },
      $setOnInsert: { taskId, userId },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).exec();
}

async function deactivateByTaskAndUser(taskId, userId) {
  const TaskCollaborator = getTaskCollaboratorModel();
  return TaskCollaborator.findOneAndUpdate(
    { taskId, userId, isActive: true },
    { $set: { isActive: false } },
    { returnDocument: 'after' }
  ).exec();
}

async function deleteByTaskId(taskId) {
  const TaskCollaborator = getTaskCollaboratorModel();
  return TaskCollaborator.deleteMany({ taskId }).exec();
}

async function listActiveTaskIdsByUserId(userId) {
  const TaskCollaborator = getTaskCollaboratorModel();
  const ids = await TaskCollaborator.distinct('taskId', { userId, isActive: true });
  return (ids || []).filter(Boolean);
}

module.exports = {
  listActiveByTaskId,
  findByTaskAndUser,
  findActiveByTaskAndUser,
  upsertActive,
  deactivateByTaskAndUser,
  deleteByTaskId,
  listActiveTaskIdsByUserId,
};
