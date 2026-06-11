const { assertObjectId } = require('../../../kernel/validators/objectId');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const topicMemberRepository = require('../repositories/discussFlowTopicMember.repository');
const requirementRepository = require('../repositories/discussFlowRequirement.repository');
const questionRepository = require('../repositories/discussFlowQuestion.repository');
const decisionRepository = require('../repositories/discussFlowDecision.repository');
const documentRepository = require('../repositories/discussFlowDocument.repository');
const aiReviewItemRepository = require('../repositories/discussFlowAiReviewItem.repository');
const aiJobQueryService = require('./aiJobQuery.service');
const guestLinkService = require('./guestLink.service');
const handoffRepository = require('../repositories/discussFlowHandoff.repository');
const {
  toTopicDto,
  toRequirementDto,
  toQuestionDto,
  toDecisionDto,
  toDocumentDto,
  toAiReviewItemDto,
} = require('../dto/discussFlow.dto');
const { assertActorTopicRead } = require('../helpers/discussFlowPermission.helper');

function buildNextActions(openQuestions, reviewRequirements, aiNextActions = [], draftDocuments = []) {
  const actions = [];

  reviewRequirements.forEach((requirement) => {
    actions.push({
      type: 'approve_requirement',
      label: `Approve: ${requirement.title}`,
      entity_id: String(requirement._id),
      priority: requirement.priority || 'medium',
    });
  });

  draftDocuments.forEach((doc) => {
    actions.push({
      type: 'lock_document',
      label: `Lock document: ${doc.title}`,
      entity_id: String(doc._id),
      priority: 'medium',
    });
  });

  aiNextActions.forEach((item) => {
    actions.push({
      type: 'ai_next_action',
      label: item.title || item.content || 'Next action',
      entity_id: String(item._id),
      priority: item.suggestedPriority || 'medium',
      source: 'ai_review',
    });
  });

  openQuestions.forEach((question) => {
    actions.push({
      type: 'answer_question',
      label: `Answer: ${question.question}`,
      entity_id: String(question._id),
      priority: 'medium',
    });
  });

  reviewRequirements.filter((row) => row.status === 'review').forEach((requirement) => {
    actions.push({
      type: 'review_requirement',
      label: `Review: ${requirement.title}`,
      entity_id: String(requirement._id),
      priority: requirement.priority || 'medium',
    });
  });

  return actions.slice(0, 12);
}

function buildSummary(topic) {
  const latest = topic?.settings?.latestAiSummary;
  if (!latest) return null;
  return {
    title: latest.title || null,
    content: latest.content || null,
    review_item_id: latest.review_item_id || null,
    approved_at: latest.approved_at || null,
    approved_by: latest.approved_by || null,
  };
}

async function getTopicPanel(actor, topicId) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const normalizedTenantId = assertObjectId(actor.tenantId, 'tenantId');

  const topic = actor.topic || await topicRepository.findById(normalizedTopicId, normalizedTenantId);
  const member = actor.member || null;
  assertActorTopicRead(actor, topic, member);

  const [
    participantCount,
    recentRequirements,
    openQuestions,
    recentDecisions,
    recentDocuments,
    openQuestionCount,
    reviewRequirementCount,
    pendingReviewCount,
    highConfidencePendingCount,
    recentReviewItems,
    aiJobs,
    aiNextActions,
    lockedDocumentsCount,
    draftDocumentsCount,
    lockedRequirementsCount,
    approvedRequirementsCount,
    lockedDecisionsCount,
    approvedDecisionsCount,
    guestLinkCounts,
    handoffCounts,
  ] = await Promise.all([
    topicMemberRepository.countByTopic(topic._id),
    requirementRepository.listRecent(topic._id, 5),
    questionRepository.listRecent(topic._id, 5),
    decisionRepository.listRecent(topic._id, 5),
    documentRepository.listRecent(topic._id, 5),
    questionRepository.countOpen(topic._id),
    requirementRepository.countInReview(topic._id),
    aiReviewItemRepository.countByStatus(topic._id, 'pending'),
    aiReviewItemRepository.countHighConfidencePending(topic._id, 0.8),
    aiReviewItemRepository.listRecent(topic._id, 5),
    aiJobQueryService.listTopicJobs(normalizedTenantId, topic._id, { activeOnly: true }),
    aiReviewItemRepository.listPendingNextActions(topic._id, 5),
    documentRepository.countByStatus(topic._id, 'locked'),
    documentRepository.countByStatus(topic._id, 'draft'),
    requirementRepository.countByStatus(topic._id, 'locked'),
    requirementRepository.countByStatus(topic._id, 'approved'),
    decisionRepository.countByStatus(topic._id, 'locked'),
    decisionRepository.countByStatus(topic._id, 'approved'),
    guestLinkService.countLinksByTopic(topic._id),
    handoffRepository.countByTopic(topic._id),
  ]);

  const draftDocuments = await documentRepository.list(topic._id, { status: 'draft', limit: 5, skip: 0 });

  return {
    topic: toTopicDto(topic),
    counts: {
      messages: topic.messageCount ?? 0,
      requirements: topic.requirementCount ?? 0,
      open_questions: openQuestionCount,
      decisions: topic.decisionCount ?? 0,
      locked_documents: lockedDocumentsCount,
      draft_documents: draftDocumentsCount,
      documents: topic.documentCount ?? 0,
    },
    requirements: recentRequirements.map(toRequirementDto),
    open_questions: openQuestions.map(toQuestionDto),
    decisions: recentDecisions.map(toDecisionDto),
    documents: {
      recent: recentDocuments.map(toDocumentDto),
      locked_count: lockedDocumentsCount,
      draft_count: draftDocumentsCount,
    },
    ai_jobs: aiJobs,
    ai_review: {
      pending_count: pendingReviewCount,
      high_confidence_count: highConfidencePendingCount,
      recent_items: recentReviewItems.map(toAiReviewItemDto),
    },
    truth_status: {
      locked_requirements: lockedRequirementsCount,
      approved_requirements: approvedRequirementsCount,
      locked_decisions: lockedDecisionsCount,
      approved_decisions: approvedDecisionsCount,
      locked_documents: lockedDocumentsCount,
      open_questions: openQuestionCount,
    },
    summary: buildSummary(topic),
    next_actions: buildNextActions(openQuestions, recentRequirements, aiNextActions, draftDocuments.items),
    participant_count: participantCount,
    guest_links: {
      active_count: guestLinkCounts.active,
      expired_count: guestLinkCounts.expired,
      revoked_count: guestLinkCounts.revoked,
    },
    handoffs: {
      pending_count: handoffCounts.pending,
      created_count: handoffCounts.created,
      failed_count: handoffCounts.failed,
    },
    last_activity: topic.lastActivityAt || topic.lastMessageAt || topic.updatedAt || null,
    meta: {
      review_requirements: reviewRequirementCount,
    },
  };
}

module.exports = {
  getTopicPanel,
  buildNextActions,
  buildSummary,
};
