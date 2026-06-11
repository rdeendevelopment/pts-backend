const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const decisionRepository = require('../repositories/discussFlowDecision.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const topicService = require('./topic.service');
const timelineService = require('./timeline.service');
const { toDecisionDto } = require('../dto/discussFlow.dto');
const { pickString, parsePagination } = require('../helpers/payload.helper');
const { assertTopicWrite } = require('../helpers/discussFlowPermission.helper');
const {
  emitDecisionCreated,
  emitRightPanelUpdated,
} = require('../helpers/discussFlowSocketEvents.helper');
const panelService = require('./panel.service');
const { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = require('../constants/discussFlow.constants');

async function createDecision(tenantId, accountId, topicId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  assertTopicWrite(normalizedAccountId, topic, member);

  const title = pickString(payload, 'title');
  if (!title) {
    throw new AppError('Decision title is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { title: 'title is required' },
    });
  }

  const row = await decisionRepository.create({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    title,
    context: pickString(payload, 'context'),
    impact: pickString(payload, 'impact'),
    status: 'draft',
    ownerId: normalizedAccountId,
    linkedRequirements: payload.linked_requirements || payload.linkedRequirements || [],
    version: 1,
  });

  await topicRepository.incrementCounter(topic._id, normalizedTenantId, 'decisionCount', 1);

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'decision_created',
    actorId: normalizedAccountId,
    payload: { decision_id: String(row._id), title },
  });

  const dto = toDecisionDto(row);
  emitDecisionCreated(topic._id, dto);
  const panel = await panelService.getTopicPanel(
    {
      actorType: 'user',
      actorId: String(normalizedAccountId),
      tenantId: String(normalizedTenantId),
      topic,
      member,
    },
    topic._id
  );
  emitRightPanelUpdated(topic._id, {
    counts: panel.counts,
    participant_count: panel.participant_count,
    last_activity: panel.last_activity,
  });

  return dto;
}

async function listDecisions(tenantId, accountId, topicId, query = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  const { assertTopicRead } = require('../helpers/discussFlowPermission.helper');
  assertTopicRead(normalizedAccountId, topic, member);

  const { limit, page, skip } = parsePagination(query, { limit: DEFAULT_PAGE_LIMIT, max: MAX_PAGE_LIMIT });
  const { items, total } = await decisionRepository.list(topic._id, {
    search: pickString(query, 'q', 'search'),
    status: pickString(query, 'status'),
    limit,
    skip,
  });

  return {
    items: items.map(toDecisionDto),
    meta: { page, limit, total },
  };
}

module.exports = {
  createDecision,
  listDecisions,
};
