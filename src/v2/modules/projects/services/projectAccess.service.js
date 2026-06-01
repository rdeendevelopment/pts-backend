const { AppError } = require('../../../kernel/errors');
const projectErrorCodes = require('../errors/projectErrorCodes');
const projectRepository = require('../repositories/project.repository');

async function getProjectOrThrow(projectId, { includeDeleted = false } = {}) {
  const project = await projectRepository.findById(projectId, { includeDeleted });
  if (!project) {
    throw new AppError('Project not found', {
      status: 404,
      code: projectErrorCodes.PROJECT_NOT_FOUND,
    });
  }
  return project;
}

module.exports = {
  getProjectOrThrow,
};
