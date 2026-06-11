const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const requirementRepository = require('../repositories/discussFlowRequirement.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const topicService = require('./topic.service');
const timelineService = require('./timeline.service');
const { toRequirementDto } = require('../dto/discussFlow.dto');
const { pickString, parsePagination } = require('../helpers/payload.helper');
const { assertTopicWrite } = require('../helpers/discussFlowPermission.helper');
const {
  emitRequirementCreated,
  emitRightPanelUpdated,
} = require('../helpers/discussFlowSocketEvents.helper');
const panelService = require('./panel.service');
const { REQUIREMENT_STATUS, TOPIC_PRIORITY, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = require('../constants/discussFlow.constants');

async function createRequirement(tenantId, accountId, topicId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  assertTopicWrite(normalizedAccountId, topic, member);

  const title = pickString(payload, 'title');
  if (!title) {
    throw new AppError('Requirement title is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { title: 'title is required' },
    });
  }

  const priority = pickString(payload, 'priority') || 'medium';
  if (!TOPIC_PRIORITY.includes(priority)) {
    throw new AppError('Invalid priority', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
    });
  }

  const row = await requirementRepository.create({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    title,
    description: pickString(payload, 'description'),
    status: 'draft',
    priority,
    createdBy: normalizedAccountId,
    linkedDecisionIds: [],
    linkedTaskIds: [],
  });

  await topicRepository.incrementCounter(topic._id, normalizedTenantId, 'requirementCount', 1);

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'requirement_created',
    actorId: normalizedAccountId,
    payload: { requirement_id: String(row._id), title },
  });

  const dto = toRequirementDto(row);
  emitRequirementCreated(topic._id, dto);
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

async function listRequirements(tenantId, accountId, topicId, query = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  const { assertTopicRead } = require('../helpers/discussFlowPermission.helper');
  assertTopicRead(normalizedAccountId, topic, member);

  const { limit, page, skip } = parsePagination(query, { limit: DEFAULT_PAGE_LIMIT, max: MAX_PAGE_LIMIT });
  const { items, total } = await requirementRepository.list(topic._id, {
    search: pickString(query, 'q', 'search'),
    status: pickString(query, 'status'),
    limit,
    skip,
  });

  return {
    items: items.map(toRequirementDto),
    meta: { page, limit, total },
  };
}

module.exports = {
  createRequirement,
  listRequirements,
};
