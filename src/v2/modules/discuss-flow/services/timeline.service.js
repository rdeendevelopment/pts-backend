const timelineRepository = require('../repositories/discussFlowTimeline.repository');
const { toTimelineDto } = require('../dto/discussFlow.dto');
const { parsePagination } = require('../helpers/payload.helper');
const { TIMELINE_EVENT_TYPES } = require('../constants/discussFlow.constants');
const { AppError } = require('../../../kernel/errors');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');

function assertValidEventType(eventType) {
  if (!TIMELINE_EVENT_TYPES.includes(eventType)) {
    throw new AppError('Invalid timeline event type', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { allowed: TIMELINE_EVENT_TYPES },
    });
  }
}

async function recordEvent({ topicId, tenantId, eventType, actorId, payload = {} }) {
  assertValidEventType(eventType);
  const row = await timelineRepository.create({
    topicId,
    tenantId,
    eventType,
    actorId,
    payload,
  });
  return toTimelineDto(row);
}

async function listTimeline(topicId, query = {}) {
  const { limit, page, skip } = parsePagination(query, { limit: 50, max: 200 });
  const { items, total } = await timelineRepository.list(topicId, { limit, skip });
  return {
    items: items.map(toTimelineDto),
    meta: { page, limit, total },
  };
}

module.exports = {
  recordEvent,
  listTimeline,
};
