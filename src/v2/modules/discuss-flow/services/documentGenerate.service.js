const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { aiDispatcher } = require('../../ai');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const requirementRepository = require('../repositories/discussFlowRequirement.repository');
const decisionRepository = require('../repositories/discussFlowDecision.repository');
const questionRepository = require('../repositories/discussFlowQuestion.repository');
const messageRepository = require('../repositories/discussFlowMessage.repository');
const topicService = require('./topic.service');
const documentService = require('./document.service');
const discussFlowAiJobHandler = require('./discussFlowAiJobHandler.service');
const { pickString, pickArray } = require('../helpers/payload.helper');
const { DOCUMENT_TYPES } = require('../constants/discussFlow.constants');
const { assertTopicManage } = require('../helpers/discussFlowPermission.helper');
const { emitDocumentDraftCreated } = require('../helpers/discussFlowSocketEvents.helper');
const { emitTruthPanelUpdate } = require('../helpers/truthPanel.helper');

const LARGE_CONTEXT_THRESHOLD = 12;

async function loadContextEntities(topicId, payload = {}) {
  const requirementIds = pickArray(payload, 'requirement_ids', 'requirementIds') || [];
  const decisionIds = pickArray(payload, 'decision_ids', 'decisionIds') || [];
  const questionIds = pickArray(payload, 'question_ids', 'questionIds') || [];
  const messageIds = pickArray(payload, 'message_ids', 'messageIds') || [];

  const [requirements, decisions, questions, messages] = await Promise.all([
    requirementIds.length
      ? requirementRepository.list(topicId, { limit: requirementIds.length }).then((r) => r.items.filter((row) => requirementIds.includes(String(row._id))))
      : requirementRepository.list(topicId, { status: 'approved', limit: 50 }).then((r) => r.items),
    decisionIds.length
      ? decisionRepository.list(topicId, { limit: decisionIds.length }).then((r) => r.items.filter((row) => decisionIds.includes(String(row._id))))
      : decisionRepository.list(topicId, { status: 'locked', limit: 50 }).then((r) => r.items),
    questionIds.length
      ? questionRepository.list(topicId, { limit: questionIds.length }).then((r) => r.items.filter((row) => questionIds.includes(String(row._id))))
      : questionRepository.list(topicId, { status: 'answered', limit: 50 }).then((r) => r.items),
    messageIds.length
      ? Promise.all(messageIds.map((id) => messageRepository.findById(id, topicId))).then((rows) => rows.filter(Boolean))
      : messageRepository.list(topicId, { limit: 30 }).then((r) => r.items),
  ]);

  return { requirements, decisions, questions, messages };
}

async function generateDocument(tenantId, accountId, topicId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  assertTopicManage(normalizedAccountId, topic, member);

  const documentType = pickString(payload, 'document_type', 'documentType') || 'requirements_document';
  if (!DOCUMENT_TYPES.includes(documentType)) {
    throw new AppError('Invalid document type', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { allowed: DOCUMENT_TYPES },
    });
  }

  const contextEntities = await loadContextEntities(topic._id, payload);
  const contextSize = contextEntities.requirements.length
    + contextEntities.decisions.length
    + contextEntities.questions.length
    + contextEntities.messages.length;

  const input = {
    documentType,
    instructions: pickString(payload, 'instructions') || '',
    approvedRequirements: contextEntities.requirements,
    lockedRequirements: contextEntities.requirements.filter((row) => row.status === 'locked'),
    approvedDecisions: contextEntities.decisions.filter((row) => row.status === 'approved'),
    lockedDecisions: contextEntities.decisions.filter((row) => row.status === 'locked'),
    answeredQuestions: contextEntities.questions,
    selectedMessages: contextEntities.messages,
    forceAsync: contextSize >= LARGE_CONTEXT_THRESHOLD,
  };

  const aiResponse = await aiDispatcher.execute({
    action: 'DISCUSS_GENERATE_DOCUMENT',
    actor: normalizedAccountId,
    tenantId: normalizedTenantId,
    sourceModule: 'discuss-flow',
    sourceId: String(topic._id),
    context: {
      topicId: String(topic._id),
      workspaceId: String(topic.workspaceId),
      documentType,
    },
    input,
  });

  if (aiResponse.async) {
    return {
      status: 'queued',
      job_id: aiResponse.job_id,
      poll_url: aiResponse.poll_url,
    };
  }

  const extraction = discussFlowAiJobHandler.extractAiResult(aiResponse);
  const document = await documentService.createDraftFromAiResult({
    tenantId: normalizedTenantId,
    topicId: topic._id,
    workspaceId: topic.workspaceId,
    accountId: normalizedAccountId,
    aiJobId: null,
    extraction,
    documentType,
  });

  emitDocumentDraftCreated(topic._id, document);
  await emitTruthPanelUpdate(
    { actorType: 'user', actorId: String(normalizedAccountId), tenantId: String(normalizedTenantId) },
    topic
  );

  return { status: 'ready', document_id: document.id, document };
}

module.exports = {
  generateDocument,
  LARGE_CONTEXT_THRESHOLD,
};
