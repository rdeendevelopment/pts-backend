const { getProjectEventModel } = require('../models/projectEvent.model');

async function listByProjectId(projectId, { limit = 50, eventType = null } = {}) {
  const ProjectEvent = getProjectEventModel();
  const query = { projectId };
  if (eventType) query.eventType = eventType;
  return ProjectEvent.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
}

async function createEvent(payload) {
  const ProjectEvent = getProjectEventModel();
  return ProjectEvent.create(payload);
}

module.exports = {
  listByProjectId,
  createEvent,
};
