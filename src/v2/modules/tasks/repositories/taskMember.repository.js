const { getTaskMemberModel } = require('../models/taskMember.model');

async function listByProjectId(projectId, { activeOnly = true } = {}) {
  const TaskMember = getTaskMemberModel();
  const query = { projectId };
  if (activeOnly) query.isActive = true;
  return TaskMember.find(query).sort({ createdAt: 1 }).exec();
}

async function findByProjectAndUser(projectId, userId) {
  const TaskMember = getTaskMemberModel();
  return TaskMember.findOne({ projectId, userId, isActive: true }).exec();
}

async function findById(memberId, { projectId = null } = {}) {
  const TaskMember = getTaskMemberModel();
  const query = { _id: memberId };
  if (projectId) query.projectId = projectId;
  return TaskMember.findOne(query).exec();
}

async function upsertActive({ projectId, userId, role, addedBy }) {
  const TaskMember = getTaskMemberModel();
  return TaskMember.findOneAndUpdate(
    { projectId, userId },
    {
      $set: { role, isActive: true, addedBy },
      $setOnInsert: { projectId, userId },
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).exec();
}

async function deactivateByProjectAndUser(projectId, userId) {
  const TaskMember = getTaskMemberModel();
  return TaskMember.findOneAndUpdate(
    { projectId, userId, isActive: true },
    { $set: { isActive: false } },
    { returnDocument: 'after' }
  ).exec();
}

module.exports = {
  listByProjectId,
  findByProjectAndUser,
  findById,
  upsertActive,
  deactivateByProjectAndUser,
};
