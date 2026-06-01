const projectEventRepository = require('../repositories/projectEvent.repository');

async function recordEvent({
  projectId,
  eventType,
  title = null,
  description = null,
  performedBy = null,
  metadata = {},
  req = null,
}) {
  return projectEventRepository.createEvent({
    projectId,
    eventType,
    title,
    description,
    performedBy,
    metadata,
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.headers?.['user-agent'] || null,
  });
}

async function listProjectEvents(projectId, filters = {}) {
  const events = await projectEventRepository.listByProjectId(projectId, filters);
  return events;
}

module.exports = {
  recordEvent,
  listProjectEvents,
};
