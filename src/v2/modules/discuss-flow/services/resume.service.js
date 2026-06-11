const { assertObjectId } = require('../../../kernel/validators/objectId');
const topicService = require('./topic.service');
const requirementRepository = require('../repositories/discussFlowRequirement.repository');
const questionRepository = require('../repositories/discussFlowQuestion.repository');
const decisionRepository = require('../repositories/discussFlowDecision.repository');
const documentRepository = require('../repositories/discussFlowDocument.repository');
const messageRepository = require('../repositories/discussFlowMessage.repository');
const aiReviewItemRepository = require('../repositories/discussFlowAiReviewItem.repository');
const {
  toTopicDto,
  toRequirementDto,
  toQuestionDto,
  toDecisionDto,
  toDocumentDto,
  toMessageDto,
  toAiReviewItemDto,
} = require('../dto/discussFlow.dto');
const { assertActorTopicRead } = require('../helpers/discussFlowPermission.helper');
const { buildNextActions, buildSummary } = require('./panel.service');

async function resumeTopic(actor, topicId) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const normalizedTenantId = assertObjectId(actor.tenantId, 'tenantId');

  const { topic, member } = await topicService.getTopicContext(
    normalizedTenantId,
    actor.actorId,
    normalizedTopicId
  );
  assertActorTopicRead(actor, topic, member);

  const [
    lockedRequirements,
    approvedRequirements,
    openQuestions,
    lockedDecisions,
    recentMessages,
    lockedDocuments,
    pendingAiReviewItems,
  ] = await Promise.all([
    requirementRepository.listByStatus(topic._id, 'locked', 20),
    requirementRepository.listByStatus(topic._id, 'approved', 20),
    questionRepository.listRecent(topic._id, 20),
    decisionRepository.listByStatus(topic._id, 'locked', 20),
    messageRepository.listRecent(topic._id, 15),
    documentRepository.listByStatus(topic._id, 'locked', 10),
    aiReviewItemRepository.listPending(topic._id, 20),
  ]);

  const reviewRequirements = await requirementRepository.list(topic._id, { status: 'review', limit: 10, skip: 0 });
  const draftDocuments = await documentRepository.list(topic._id, { status: 'draft', limit: 5, skip: 0 });

  return {
    topic: toTopicDto(topic),
    latest_summary: buildSummary(topic),
    locked_requirements: lockedRequirements.map(toRequirementDto),
    approved_requirements: approvedRequirements.map(toRequirementDto),
    open_questions: openQuestions.map(toQuestionDto),
    locked_decisions: lockedDecisions.map(toDecisionDto),
    recent_messages: recentMessages.map(toMessageDto),
    locked_documents: lockedDocuments.map(toDocumentDto),
    pending_ai_review_items: pendingAiReviewItems.map(toAiReviewItemDto),
    suggested_next_actions: buildNextActions(
      openQuestions,
      reviewRequirements.items,
      [],
      draftDocuments.items
    ),
    meta: {
      last_activity: topic.lastActivityAt || topic.lastMessageAt || topic.updatedAt || null,
    },
  };
}

module.exports = {
  resumeTopic,
};
