const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const handoffRepository = require('../repositories/discussFlowHandoff.repository');
const requirementRepository = require('../repositories/discussFlowRequirement.repository');
const documentRepository = require('../repositories/discussFlowDocument.repository');
const aiReviewItemRepository = require('../repositories/discussFlowAiReviewItem.repository');
const topicService = require('./topic.service');
const timelineService = require('./timeline.service');
const { toHandoffDto } = require('../dto/discussFlow.dto');
const { pickString } = require('../helpers/payload.helper');
const { assertActorCanHandoff } = require('../helpers/discussFlowPermission.helper');
const {
  emitHandoffCreated,
  emitHandoffCompleted,
  emitHandoffFailed,
} = require('../helpers/discussFlowSocketEvents.helper');
const { emitTruthPanelUpdate } = require('../helpers/truthPanel.helper');

function buildActor(accountId, tenantId) {
  return { actorType: 'user', actorId: String(accountId), tenantId: String(tenantId) };
}

async function recordHandoff({
  tenantId,
  workspaceId,
  topicId,
  sourceType,
  sourceId,
  targetModule,
  status,
  targetId,
  payload,
  createdBy,
  processedBy,
  error,
}) {
  const row = await handoffRepository.create({
    tenantId,
    workspaceId,
    topicId,
    sourceType,
    sourceId,
    targetModule,
    status,
    targetId: targetId || null,
    payload,
    createdBy,
    processedBy: processedBy || null,
    error: error || null,
  });
  return toHandoffDto(row);
}

async function attemptTaskCreation(projectId, taskPayload, accountId, req) {
  const taskBoardService = require('../../tasks/services/taskBoard.service');
  const task = await taskBoardService.createTask(projectId, taskPayload, accountId, req);
  return task?.id || task?._id ? String(task.id || task._id) : null;
}

async function finalizeHandoffResponse({
  actor,
  topic,
  handoff,
  responseStatus,
  socketType,
}) {
  if (socketType === 'created') {
    emitHandoffCompleted(topic._id, handoff);
    await timelineService.recordEvent({
      topicId: topic._id,
      tenantId: actor.tenantId,
      eventType: 'handoff_completed',
      actorId: actor.actorId,
      payload: { handoff_id: handoff.id, target_id: handoff.target_id },
    });
  } else if (socketType === 'pending') {
    emitHandoffCreated(topic._id, handoff);
    await timelineService.recordEvent({
      topicId: topic._id,
      tenantId: actor.tenantId,
      eventType: 'handoff_created',
      actorId: actor.actorId,
      payload: { handoff_id: handoff.id, status: handoff.status },
    });
  } else if (socketType === 'failed') {
    emitHandoffFailed(topic._id, handoff);
    await timelineService.recordEvent({
      topicId: topic._id,
      tenantId: actor.tenantId,
      eventType: 'handoff_failed',
      actorId: actor.actorId,
      payload: { handoff_id: handoff.id, error: handoff.error },
    });
  }

  await emitTruthPanelUpdate(actor, topic);
  return {
    status: responseStatus,
    handoff_id: handoff.id,
    target_id: handoff.target_id || null,
    handoff,
  };
}

async function createTaskHandoff({
  tenantId,
  accountId,
  topic,
  member,
  sourceType,
  sourceId,
  taskPayload,
  payload,
  req,
}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanHandoff(actor, topic, member);

  const projectId = pickString(payload, 'project_id', 'projectId');
  const basePayload = {
    ...taskPayload,
    discuss_flow: {
      topic_id: String(topic._id),
      source_type: sourceType,
      source_id: String(sourceId),
    },
  };

  if (!projectId) {
    const handoff = await recordHandoff({
      tenantId: normalizedTenantId,
      workspaceId: topic.workspaceId,
      topicId: topic._id,
      sourceType,
      sourceId,
      targetModule: 'tasks',
      status: 'pending',
      payload: basePayload,
      createdBy: normalizedAccountId,
    });
    return finalizeHandoffResponse({ actor, topic, handoff, responseStatus: 'pending', socketType: 'pending' });
  }

  try {
    const targetId = await attemptTaskCreation(projectId, basePayload, normalizedAccountId, req);
    const handoff = await recordHandoff({
      tenantId: normalizedTenantId,
      workspaceId: topic.workspaceId,
      topicId: topic._id,
      sourceType,
      sourceId,
      targetModule: 'tasks',
      status: 'created',
      targetId,
      payload: basePayload,
      createdBy: normalizedAccountId,
      processedBy: normalizedAccountId,
    });

    if (sourceType === 'requirement') {
      const requirement = await requirementRepository.findById(sourceId, normalizedTenantId);
      if (requirement) {
        const linkedTaskIds = [...(requirement.linkedTaskIds || []).map(String), String(targetId)];
        await requirementRepository.updateById(sourceId, normalizedTenantId, { linkedTaskIds });
      }
    }

    if (sourceType === 'ai_review_item') {
      await aiReviewItemRepository.updateById(sourceId, normalizedTenantId, {
        status: 'converted',
        approvedEntityId: targetId,
      });
    }

    return finalizeHandoffResponse({ actor, topic, handoff, responseStatus: 'created', socketType: 'created' });
  } catch (err) {
    const handoff = await recordHandoff({
      tenantId: normalizedTenantId,
      workspaceId: topic.workspaceId,
      topicId: topic._id,
      sourceType,
      sourceId,
      targetModule: 'tasks',
      status: 'failed',
      payload: basePayload,
      createdBy: normalizedAccountId,
      error: err.message || 'Task creation failed',
    });
    return finalizeHandoffResponse({ actor, topic, handoff, responseStatus: 'pending', socketType: 'failed' });
  }
}

async function createTaskFromRequirement(tenantId, accountId, requirementId, payload = {}, req = null) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedRequirementId = assertObjectId(requirementId, 'requirementId');

  const requirement = await requirementRepository.findById(normalizedRequirementId, normalizedTenantId);
  if (!requirement) {
    throw new AppError('Requirement not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_REQUIREMENT_NOT_FOUND,
    });
  }

  if (!['approved', 'locked'].includes(requirement.status)) {
    throw new AppError('Requirement must be approved or locked before task handoff', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_HANDOFF_NOT_ALLOWED,
    });
  }

  const { topic, member } = await topicService.getTopicContext(
    normalizedTenantId,
    normalizedAccountId,
    requirement.topicId
  );

  return createTaskHandoff({
    tenantId: normalizedTenantId,
    accountId: normalizedAccountId,
    topic,
    member,
    sourceType: 'requirement',
    sourceId: requirement._id,
    taskPayload: {
      title: requirement.title,
      description: requirement.description || '',
      priority: requirement.priority || 'medium',
      tags: payload.tags || [],
    },
    payload,
    req,
  });
}

async function createTaskFromReviewItem(tenantId, accountId, itemId, payload = {}, req = null) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedItemId = assertObjectId(itemId, 'itemId');

  const item = await aiReviewItemRepository.findById(normalizedItemId, normalizedTenantId);
  if (!item) {
    throw new AppError('AI review item not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_AI_REVIEW_ITEM_NOT_FOUND,
    });
  }

  if (item.type !== 'task_candidate') {
    throw new AppError('Only approved task_candidate review items can create tasks', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_HANDOFF_NOT_ALLOWED,
    });
  }

  if (item.status !== 'approved') {
    throw new AppError('AI review item must be approved before task handoff', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_HANDOFF_NOT_ALLOWED,
    });
  }

  const { topic, member } = await topicService.getTopicContext(
    normalizedTenantId,
    normalizedAccountId,
    item.topicId
  );

  return createTaskHandoff({
    tenantId: normalizedTenantId,
    accountId: normalizedAccountId,
    topic,
    member,
    sourceType: 'ai_review_item',
    sourceId: item._id,
    taskPayload: {
      title: item.title || 'Task',
      description: item.content || '',
      priority: item.suggestedPriority || 'medium',
      tags: payload.tags || [],
    },
    payload,
    req,
  });
}

async function createProjectBriefFromDocument(tenantId, accountId, documentId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedDocumentId = assertObjectId(documentId, 'documentId');

  const document = await documentRepository.findById(normalizedDocumentId, normalizedTenantId);
  if (!document) {
    throw new AppError('Document not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_DOCUMENT_NOT_FOUND,
    });
  }

  if (document.status !== 'locked') {
    throw new AppError('Document must be locked before project brief handoff', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_HANDOFF_NOT_ALLOWED,
    });
  }

  const { topic, member } = await topicService.getTopicContext(
    normalizedTenantId,
    normalizedAccountId,
    document.topicId
  );
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanHandoff(actor, topic, member);

  const briefPayload = {
    title: document.title,
    document_type: document.documentType,
    content: document.content,
    version: document.version,
    discuss_flow: {
      topic_id: String(topic._id),
      document_id: String(document._id),
    },
    notes: pickString(payload, 'notes') || null,
  };

  const handoff = await recordHandoff({
    tenantId: normalizedTenantId,
    workspaceId: topic.workspaceId,
    topicId: topic._id,
    sourceType: 'document',
    sourceId: document._id,
    targetModule: 'projects',
    status: 'pending',
    payload: briefPayload,
    createdBy: normalizedAccountId,
  });

  return finalizeHandoffResponse({ actor, topic, handoff, responseStatus: 'pending', socketType: 'pending' });
}

module.exports = {
  createTaskFromRequirement,
  createTaskFromReviewItem,
  createProjectBriefFromDocument,
};
