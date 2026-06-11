const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const questionRepository = require('../repositories/discussFlowQuestion.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const topicService = require('./topic.service');
const timelineService = require('./timeline.service');
const { toQuestionDto } = require('../dto/discussFlow.dto');
const { pickString, parsePagination } = require('../helpers/payload.helper');
const { assertTopicWrite } = require('../helpers/discussFlowPermission.helper');
const {
  emitQuestionCreated,
  emitRightPanelUpdated,
} = require('../helpers/discussFlowSocketEvents.helper');
const panelService = require('./panel.service');
const { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = require('../constants/discussFlow.constants');

async function createQuestion(tenantId, accountId, topicId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  assertTopicWrite(normalizedAccountId, topic, member);

  const question = pickString(payload, 'question');
  if (!question) {
    throw new AppError('Question text is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { question: 'question is required' },
    });
  }

  const row = await questionRepository.create({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    question,
    answer: pickString(payload, 'answer'),
    status: 'open',
    ownerId: normalizedAccountId,
    linkedMessages: payload.linked_messages || payload.linkedMessages || [],
  });

  await topicRepository.incrementCounter(topic._id, normalizedTenantId, 'questionCount', 1);

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'question_created',
    actorId: normalizedAccountId,
    payload: { question_id: String(row._id) },
  });

  const dto = toQuestionDto(row);
  emitQuestionCreated(topic._id, dto);
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

async function listQuestions(tenantId, accountId, topicId, query = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  const { assertTopicRead } = require('../helpers/discussFlowPermission.helper');
  assertTopicRead(normalizedAccountId, topic, member);

  const { limit, page, skip } = parsePagination(query, { limit: DEFAULT_PAGE_LIMIT, max: MAX_PAGE_LIMIT });
  const { items, total } = await questionRepository.list(topic._id, {
    status: pickString(query, 'status'),
    limit,
    skip,
  });

  return {
    items: items.map(toQuestionDto),
    meta: { page, limit, total },
  };
}

module.exports = {
  createQuestion,
  listQuestions,
};
