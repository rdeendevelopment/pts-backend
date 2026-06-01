const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const projectStatsService = require('../services/projectStats.service');
const projectService = require('../services/project.service');
const { toProjectStatsDto } = require('../dto/project.dto');

async function getProjectStats(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  await projectService.getProjectOrThrow(projectId);
  const stats = await projectStatsService.recalculateStats(projectId);
  return sendSuccess(res, toProjectStatsDto(stats));
}

module.exports = {
  getProjectStats: asyncHandler(getProjectStats),
};
