const { getProjectAssignmentModel } = require('../models/projectAssignment.model');

async function listByProjectId(projectId, { includeDeleted = false, status = null } = {}) {
  const ProjectAssignment = getProjectAssignmentModel();
  const query = { projectId };
  if (!includeDeleted) query.isDeleted = false;
  if (status) query.status = status;
  return ProjectAssignment.find(query).sort({ createdAt: -1 }).exec();
}

async function findById(assignmentId, { projectId = null, includeDeleted = false } = {}) {
  const ProjectAssignment = getProjectAssignmentModel();
  const query = { _id: assignmentId };
  if (projectId) query.projectId = projectId;
  if (!includeDeleted) query.isDeleted = false;
  return ProjectAssignment.findOne(query).exec();
}

async function findByProjectAndUser(projectId, userId, { includeDeleted = false } = {}) {
  const ProjectAssignment = getProjectAssignmentModel();
  const query = { projectId, userId };
  if (!includeDeleted) query.isDeleted = false;
  return ProjectAssignment.findOne(query).exec();
}

async function createAssignment(payload) {
  const ProjectAssignment = getProjectAssignmentModel();
  return ProjectAssignment.create(payload);
}

async function updateAssignment(assignmentId, projectId, payload) {
  const ProjectAssignment = getProjectAssignmentModel();
  return ProjectAssignment.findOneAndUpdate(
    { _id: assignmentId, projectId, isDeleted: false },
    { $set: payload },
    { returnDocument: 'after', runValidators: true }
  ).exec();
}

async function softRemoveAssignment(assignmentId, projectId, { removedBy, updatedBy }) {
  const ProjectAssignment = getProjectAssignmentModel();
  return ProjectAssignment.findOneAndUpdate(
    { _id: assignmentId, projectId, isDeleted: false },
    {
      $set: {
        status: 'removed',
        isDeleted: true,
        deletedAt: new Date(),
        removedBy,
        removedAt: new Date(),
        updatedBy,
      },
    },
    { returnDocument: 'after' }
  ).exec();
}

async function countActiveMembers(projectId) {
  const ProjectAssignment = getProjectAssignmentModel();
  return ProjectAssignment.countDocuments({
    projectId,
    isDeleted: false,
    status: 'active',
  }).exec();
}

async function listActiveProjectIdsByUserId(userId) {
  const ProjectAssignment = getProjectAssignmentModel();
  const rows = await ProjectAssignment.find({
    userId,
    isDeleted: false,
    status: 'active',
  })
    .select('projectId')
    .lean();

  return [...new Set(rows.map((row) => row.projectId))];
}

module.exports = {
  listByProjectId,
  findById,
  findByProjectAndUser,
  createAssignment,
  updateAssignment,
  softRemoveAssignment,
  countActiveMembers,
  listActiveProjectIdsByUserId,
};
