const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const projectStatsService = require('../services/projectStats.service');
const projectService = require('../services/project.service');
const projectAssignmentRepository = require('../repositories/projectAssignment.repository');
const { canViewAllProjectTimeEntries } = require('../../activity/helpers/access.helper');
const { resolveUserIdFromAuth } = require('../../tasks/helpers/taskAccessScope.helper');
const { AppError } = require('../../../kernel/errors');
const projectErrorCodes = require('../errors/projectErrorCodes');
const { toProjectStatsDto } = require('../dto/project.dto');

async function getProjectStats(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  await projectService.getProjectOrThrow(projectId);
  let stats;

  if (canViewAllProjectTimeEntries(req)) {
    stats = await projectStatsService.recalculateStats(projectId);
  } else {
    const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
    const assignment = await projectAssignmentRepository.findByProjectAndUser(projectId, userId);
    if (!assignment || assignment.isDeleted || assignment.status !== 'active') {
      throw new AppError('Project activity access forbidden', {
        status: 403,
        code: projectErrorCodes.PROJECT_ACTIVITY_FORBIDDEN,
      });
    }
    stats = projectStatsService.buildAssignmentScopedStats(projectId, assignment);
  }

  return sendSuccess(res, toProjectStatsDto(stats));
}

module.exports = {
  getProjectStats: asyncHandler(getProjectStats),
};
