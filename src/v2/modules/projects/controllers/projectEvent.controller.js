const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const projectService = require('../services/project.service');
const projectEventService = require('../services/projectEvent.service');
const { toProjectEventDto } = require('../dto/project.dto');

async function listProjectEvents(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  await projectService.getProjectOrThrow(projectId);

  const events = await projectEventService.listProjectEvents(projectId, {
    limit: Number(req.query.limit) || 50,
    eventType: req.query.event_type || req.query.eventType || null,
  });

  return sendSuccess(res, {
    items: events.map(toProjectEventDto),
  });
}

module.exports = {
  listProjectEvents: asyncHandler(listProjectEvents),
};
