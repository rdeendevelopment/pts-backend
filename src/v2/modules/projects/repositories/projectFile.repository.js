const { getProjectFileModel } = require('../models/projectFile.model');

async function listByProjectId(projectId, { includeDeleted = false } = {}) {
  const ProjectFile = getProjectFileModel();
  const query = { projectId };
  if (!includeDeleted) query.isDeleted = false;
  return ProjectFile.find(query).sort({ createdAt: -1 }).exec();
}

async function findById(fileId, { projectId = null, includeDeleted = false } = {}) {
  const ProjectFile = getProjectFileModel();
  const query = { _id: fileId };
  if (projectId) query.projectId = projectId;
  if (!includeDeleted) query.isDeleted = false;
  return ProjectFile.findOne(query).exec();
}

async function createFile(payload) {
  const ProjectFile = getProjectFileModel();
  return ProjectFile.create(payload);
}

async function softDeleteFile(fileId, projectId, updatedBy) {
  const ProjectFile = getProjectFileModel();
  return ProjectFile.findOneAndUpdate(
    { _id: fileId, projectId, isDeleted: false },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        updatedBy,
      },
    },
    { returnDocument: 'after' }
  ).exec();
}

async function countByProjectId(projectId, { includeDeleted = false } = {}) {
  const ProjectFile = getProjectFileModel();
  const query = { projectId };
  if (!includeDeleted) query.isDeleted = false;
  return ProjectFile.countDocuments(query).exec();
}

module.exports = {
  listByProjectId,
  findById,
  createFile,
  softDeleteFile,
  countByProjectId,
};
