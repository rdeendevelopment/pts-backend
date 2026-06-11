const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const aiReviewItemRepository = require('../repositories/discussFlowAiReviewItem.repository');
const requirementRepository = require('../repositories/discussFlowRequirement.repository');
const questionRepository = require('../repositories/discussFlowQuestion.repository');
const decisionRepository = require('../repositories/discussFlowDecision.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const topicService = require('./topic.service');
const timelineService = require('./timeline.service');
const {
  toAiReviewItemDto,
  toRequirementDto,
  toQuestionDto,
  toDecisionDto,
} = require('../dto/discussFlow.dto');
const { pickString, pickArray, parsePagination } = require('../helpers/payload.helper');
const { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } = require('../constants/discussFlow.constants');
const {
  assertActorTopicRead,
  assertActorCanApproveAiReview,
  assertActorCanApproveOrLock,
} = require('../helpers/discussFlowPermission.helper');
const {
  emitAiReviewItemApproved,
  emitAiReviewItemDismissed,
  emitRightPanelUpdated,
  emitRequirementCreated,
  emitQuestionCreated,
  emitDecisionCreated,
} = require('../helpers/discussFlowSocketEvents.helper');
const panelService = require('./panel.service');
const { AI_REVIEW_ITEM_TYPES } = require('../constants/discussFlow.constants');

async function listReviewItems(actor, topicId, query = {}) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const { topic, member } = await topicService.getTopicContext(actor.tenantId, actor.actorId, normalizedTopicId);
  assertActorTopicRead(actor, topic, member);

  const { limit, page, skip } = parsePagination(query, { limit: DEFAULT_PAGE_LIMIT, max: MAX_PAGE_LIMIT });
  const { items, total } = await aiReviewItemRepository.list(topic._id, {
    tenantId: actor.tenantId,
    type: pickString(query, 'type'),
    status: pickString(query, 'status'),
    importBatchId: query.import_batch_id || query.importBatchId || null,
    messageId: query.message_id || query.messageId || null,
    limit,
    skip,
  });

  return {
    items: items.map(toAiReviewItemDto),
    meta: { page, limit, total },
  };
}

async function updateReviewItem(actor, itemId, payload = {}) {
  const normalizedItemId = assertObjectId(itemId, 'itemId');
  const item = await aiReviewItemRepository.findById(normalizedItemId, actor.tenantId);
  if (!item) {
    throw new AppError('AI review item not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_AI_REVIEW_ITEM_NOT_FOUND,
    });
  }

  const { topic, member } = await topicService.getTopicContext(actor.tenantId, actor.actorId, item.topicId);
  assertActorCanApproveAiReview(actor, topic, member);

  if (!['pending', 'edited'].includes(item.status)) {
    throw new AppError('Only pending review items can be edited', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
    });
  }

  const updates = {
    status: 'edited',
  };

  const title = pickString(payload, 'title');
  const content = pickString(payload, 'content');
  const priority = pickString(payload, 'suggested_priority', 'suggestedPriority');

  if (title) updates.title = title;
  if (content) updates.content = content;
  if (priority) updates.suggestedPriority = priority;

  const updated = await aiReviewItemRepository.updateById(item._id, actor.tenantId, updates);
  return toAiReviewItemDto(updated);
}

async function emitPanel(actor, topic) {
  const panel = await panelService.getTopicPanel({ ...actor, topic }, topic._id);
  emitRightPanelUpdated(topic._id, {
    counts: panel.counts,
    participant_count: panel.participant_count,
    last_activity: panel.last_activity,
    ai_jobs: panel.ai_jobs,
    ai_review: panel.ai_review,
    summary: panel.summary,
    next_actions: panel.next_actions,
  });
}

async function approveReviewItem(actor, itemId) {
  const normalizedItemId = assertObjectId(itemId, 'itemId');
  const item = await aiReviewItemRepository.findById(normalizedItemId, actor.tenantId);
  if (!item) {
    throw new AppError('AI review item not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_AI_REVIEW_ITEM_NOT_FOUND,
    });
  }

  const { topic, member } = await topicService.getTopicContext(actor.tenantId, actor.actorId, item.topicId);
  assertActorCanApproveAiReview(actor, topic, member);

  if (!['pending', 'edited'].includes(item.status)) {
    throw new AppError('Review item is not pending approval', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
    });
  }

  let approvedEntity = null;
  let approvedEntityId = null;

  if (item.type === 'requirement') {
    const row = await requirementRepository.create({
      topicId: topic._id,
      tenantId: actor.tenantId,
      title: item.title || 'Requirement',
      description: item.content,
      status: 'review',
      priority: item.suggestedPriority || 'medium',
      createdBy: actor.actorId,
      linkedDecisionIds: [],
      linkedTaskIds: [],
    });
    await topicRepository.incrementCounter(topic._id, actor.tenantId, 'requirementCount', 1);
    approvedEntity = toRequirementDto(row);
    approvedEntityId = row._id;
    emitRequirementCreated(topic._id, approvedEntity);
  } else if (item.type === 'question') {
    const row = await questionRepository.create({
      topicId: topic._id,
      tenantId: actor.tenantId,
      question: item.title || item.content || 'Question',
      answer: null,
      status: 'open',
      ownerId: actor.actorId,
      linkedMessages: item.linkedMessageIds || [],
    });
    await topicRepository.incrementCounter(topic._id, actor.tenantId, 'questionCount', 1);
    approvedEntity = toQuestionDto(row);
    approvedEntityId = row._id;
    emitQuestionCreated(topic._id, approvedEntity);
  } else if (item.type === 'decision') {
    const parts = String(item.content || '').split('\n\n');
    const row = await decisionRepository.create({
      topicId: topic._id,
      tenantId: actor.tenantId,
      title: item.title || 'Decision',
      context: parts[0] || item.content,
      impact: parts[1] || null,
      status: 'draft',
      ownerId: actor.actorId,
      linkedRequirements: [],
      version: 1,
    });
    await topicRepository.incrementCounter(topic._id, actor.tenantId, 'decisionCount', 1);
    approvedEntity = toDecisionDto(row);
    approvedEntityId = row._id;
    emitDecisionCreated(topic._id, approvedEntity);
  } else if (item.type === 'summary') {
    const freshTopic = await topicRepository.findById(topic._id, actor.tenantId);
    await topicRepository.updateById(topic._id, actor.tenantId, {
      aiSummaryId: item._id,
      settings: {
        ...(freshTopic?.settings || {}),
        latestAiSummary: {
          review_item_id: String(item._id),
          title: item.title,
          content: item.content,
          approved_at: new Date().toISOString(),
          approved_by: String(actor.actorId),
        },
      },
    });
    approvedEntityId = item._id;
  }

  const updated = await aiReviewItemRepository.updateById(item._id, actor.tenantId, {
    status: 'approved',
    approvedEntityId,
    reviewedBy: actor.actorId,
    reviewedAt: new Date(),
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: actor.tenantId,
    eventType: 'ai_review_item_approved',
    actorId: actor.actorId,
    payload: {
      review_item_id: String(updated._id),
      type: updated.type,
      approved_entity_id: approvedEntityId ? String(approvedEntityId) : null,
    },
  });

  const dto = toAiReviewItemDto(updated);
  emitAiReviewItemApproved(topic._id, dto, { approved_entity: approvedEntity });
  await emitPanel(actor, topic);

  return {
    review_item: dto,
    approved_entity: approvedEntity,
  };
}

async function dismissReviewItem(actor, itemId) {
  const normalizedItemId = assertObjectId(itemId, 'itemId');
  const item = await aiReviewItemRepository.findById(normalizedItemId, actor.tenantId);
  if (!item) {
    throw new AppError('AI review item not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_AI_REVIEW_ITEM_NOT_FOUND,
    });
  }

  const { topic, member } = await topicService.getTopicContext(actor.tenantId, actor.actorId, item.topicId);
  assertActorCanApproveAiReview(actor, topic, member);

  const updated = await aiReviewItemRepository.updateById(item._id, actor.tenantId, {
    status: 'dismissed',
    reviewedBy: actor.actorId,
    reviewedAt: new Date(),
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: actor.tenantId,
    eventType: 'ai_review_item_dismissed',
    actorId: actor.actorId,
    payload: { review_item_id: String(updated._id), type: updated.type },
  });

  const dto = toAiReviewItemDto(updated);
  emitAiReviewItemDismissed(topic._id, dto);
  await emitPanel(actor, topic);
  return dto;
}

async function getMessageSuggestions(actor, topicId, messageId) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const normalizedMessageId = assertObjectId(messageId, 'messageId');
  const { topic, member } = await topicService.getTopicContext(actor.tenantId, actor.actorId, normalizedTopicId);
  assertActorTopicRead(actor, topic, member);

  const items = await aiReviewItemRepository.listByMessage(topic._id, normalizedMessageId);
  const pending = items.filter((row) => ['pending', 'edited'].includes(row.status));

  return {
    status: pending.length ? 'ready' : (items.length ? 'processed' : 'not_ready'),
    message_id: String(normalizedMessageId),
    items: items.map(toAiReviewItemDto),
    meta: {
      pending_count: pending.length,
      total_count: items.length,
    },
  };
}

function assertValidReviewType(type) {
  if (type && !AI_REVIEW_ITEM_TYPES.includes(type)) {
    throw new AppError('Invalid AI review item type', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { allowed: AI_REVIEW_ITEM_TYPES },
    });
  }
}

const REVIEW_TO_DOCUMENT_TYPE = {
  summary: 'meeting_summary',
  risk: 'technical_notes',
  next_action: 'custom',
};

async function createDocumentDraftFromReviewItem(actor, itemId, payload = {}) {
  const normalizedItemId = assertObjectId(itemId, 'itemId');
  const item = await aiReviewItemRepository.findById(normalizedItemId, actor.tenantId);
  if (!item) {
    throw new AppError('AI review item not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_AI_REVIEW_ITEM_NOT_FOUND,
    });
  }

  const { topic, member } = await topicService.getTopicContext(actor.tenantId, actor.actorId, item.topicId);
  assertActorCanApproveOrLock(actor, topic, member);

  if (!['summary', 'risk', 'next_action'].includes(item.type)) {
    throw new AppError('Review item type cannot create document draft', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { allowed: ['summary', 'risk', 'next_action'] },
    });
  }

  const documentService = require('./document.service');
  const documentType = pickString(payload, 'document_type', 'documentType')
    || REVIEW_TO_DOCUMENT_TYPE[item.type]
    || 'custom';

  const document = await documentService.createDraftFromAiResult({
    tenantId: actor.tenantId,
    topicId: topic._id,
    workspaceId: topic.workspaceId,
    accountId: actor.actorId,
    aiJobId: item.createdByAiJobId,
    extraction: {
      title: item.title || 'Review item document',
      document_type: documentType,
      content_markdown: item.content || '',
      sections: [],
      linked_requirement_refs: [],
      linked_decision_refs: [],
      unresolved_questions: [],
      assumptions: item.reasoning ? [item.reasoning] : [],
    },
    documentType,
    sourceReviewItemIds: [item._id],
  });

  const { emitDocumentDraftCreated } = require('../helpers/discussFlowSocketEvents.helper');
  emitDocumentDraftCreated(topic._id, document, { review_item_id: String(item._id) });
  await emitPanel(actor, topic);

  return { document, review_item_id: String(item._id) };
}

async function bulkApproveReviewItems(actor, topicId, payload = {}) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const { topic, member } = await topicService.getTopicContext(actor.tenantId, actor.actorId, normalizedTopicId);
  assertActorCanApproveAiReview(actor, topic, member);

  const itemIds = (pickArray(payload, 'item_ids', 'itemIds') || []).map((id) => String(id));
  const filterType = pickString(payload, 'type');
  const approved = [];
  const failed = [];

  for (const itemId of itemIds) {
    try {
      const item = await aiReviewItemRepository.findById(itemId, actor.tenantId);
      if (!item || String(item.topicId) !== String(topic._id)) {
        failed.push({ item_id: itemId, error: 'Item not found in topic' });
        continue;
      }
      if (filterType && item.type !== filterType) {
        failed.push({ item_id: itemId, error: `Item type mismatch: ${item.type}` });
        continue;
      }
      const result = await approveReviewItem(actor, itemId);
      approved.push(result.review_item || result);
    } catch (err) {
      failed.push({ item_id: itemId, error: err.message || 'Approval failed' });
    }
  }

  await emitPanel(actor, topic);
  return { approved, dismissed: [], failed };
}

async function bulkDismissReviewItems(actor, topicId, payload = {}) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const { topic, member } = await topicService.getTopicContext(actor.tenantId, actor.actorId, normalizedTopicId);
  assertActorCanApproveAiReview(actor, topic, member);

  const itemIds = (pickArray(payload, 'item_ids', 'itemIds') || []).map((id) => String(id));
  const filterType = pickString(payload, 'type');
  const dismissed = [];
  const failed = [];

  for (const itemId of itemIds) {
    try {
      const item = await aiReviewItemRepository.findById(itemId, actor.tenantId);
      if (!item || String(item.topicId) !== String(topic._id)) {
        failed.push({ item_id: itemId, error: 'Item not found in topic' });
        continue;
      }
      if (filterType && item.type !== filterType) {
        failed.push({ item_id: itemId, error: `Item type mismatch: ${item.type}` });
        continue;
      }
      const result = await dismissReviewItem(actor, itemId);
      dismissed.push(result);
    } catch (err) {
      failed.push({ item_id: itemId, error: err.message || 'Dismiss failed' });
    }
  }

  await emitPanel(actor, topic);
  return { approved: [], dismissed, failed };
}

module.exports = {
  listReviewItems,
  updateReviewItem,
  approveReviewItem,
  dismissReviewItem,
  bulkApproveReviewItems,
  bulkDismissReviewItems,
  getMessageSuggestions,
  createDocumentDraftFromReviewItem,
  assertValidReviewType,
};
