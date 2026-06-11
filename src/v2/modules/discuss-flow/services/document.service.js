const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const documentRepository = require('../repositories/discussFlowDocument.repository');
const documentVersionRepository = require('../repositories/discussFlowDocumentVersion.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const topicService = require('./topic.service');
const timelineService = require('./timeline.service');
const { toDocumentDto, toDocumentVersionDto } = require('../dto/discussFlow.dto');
const { pickString, pickField, parsePagination } = require('../helpers/payload.helper');
const { ensureUniqueSlug } = require('../helpers/slug.helper');
const {
  DOCUMENT_TYPES,
  DOCUMENT_CONTENT_FORMAT,
  DOCUMENT_SOURCE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} = require('../constants/discussFlow.constants');
const {
  assertActorCanReadDocuments,
  assertActorCanCreateDraftDocument,
  assertActorCanSubmitForReview,
  assertActorCanApproveOrLock,
} = require('../helpers/discussFlowPermission.helper');
const {
  assertDocumentTransition,
  assertDocumentEditable,
} = require('../helpers/discussFlowLifecycle.helper');
const {
  emitDocumentCreated,
  emitDocumentUpdated,
  emitDocumentReviewSubmitted,
  emitDocumentLocked,
  emitDocumentVersionCreated,
} = require('../helpers/discussFlowSocketEvents.helper');
const { emitTruthPanelUpdate } = require('../helpers/truthPanel.helper');

function buildActor(accountId, tenantId) {
  return { actorType: 'user', actorId: String(accountId), tenantId: String(tenantId) };
}

async function createDocument(tenantId, accountId, topicId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanCreateDraftDocument(actor, topic, member);

  const title = pickString(payload, 'title');
  if (!title) {
    throw new AppError('Document title is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { title: 'title is required' },
    });
  }

  const documentType = pickString(payload, 'document_type', 'documentType') || 'custom';
  if (!DOCUMENT_TYPES.includes(documentType)) {
    throw new AppError('Invalid document type', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { allowed: DOCUMENT_TYPES },
    });
  }

  const contentFormat = pickString(payload, 'content_format', 'contentFormat') || 'markdown';
  if (!DOCUMENT_CONTENT_FORMAT.includes(contentFormat)) {
    throw new AppError('Invalid content format', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
    });
  }

  const slug = await ensureUniqueSlug(
    pickString(payload, 'slug') || title,
    (candidate) => documentRepository.slugExists(topic._id, candidate)
  );

  const row = await documentRepository.create({
    tenantId: normalizedTenantId,
    workspaceId: topic.workspaceId,
    topicId: topic._id,
    title,
    slug,
    documentType,
    status: 'draft',
    content: pickString(payload, 'content') || '',
    contentFormat,
    version: 1,
    source: pickString(payload, 'source') || 'manual',
    linkedRequirementIds: payload.linked_requirement_ids || payload.linkedRequirementIds || [],
    linkedDecisionIds: payload.linked_decision_ids || payload.linkedDecisionIds || [],
    linkedQuestionIds: payload.linked_question_ids || payload.linkedQuestionIds || [],
    linkedMessageIds: payload.linked_message_ids || payload.linkedMessageIds || [],
    createdBy: normalizedAccountId,
    updatedBy: normalizedAccountId,
    metadata: payload.metadata || {},
  });

  await topicRepository.incrementCounter(topic._id, normalizedTenantId, 'documentCount', 1);
  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'document_created',
    actorId: normalizedAccountId,
    payload: { document_id: String(row._id), document_type: documentType },
  });

  const dto = toDocumentDto(row);
  emitDocumentCreated(topic._id, dto);
  await emitTruthPanelUpdate(actor, topic);
  return dto;
}

async function listDocuments(tenantId, accountId, topicId, query = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  assertActorCanReadDocuments(buildActor(normalizedAccountId, normalizedTenantId), topic, member);

  const { limit, page, skip } = parsePagination(query, { limit: DEFAULT_PAGE_LIMIT, max: MAX_PAGE_LIMIT });
  const { items, total } = await documentRepository.list(topic._id, {
    status: pickString(query, 'status'),
    documentType: pickString(query, 'document_type', 'documentType'),
    limit,
    skip,
  });

  return { items: items.map(toDocumentDto), meta: { page, limit, total } };
}

async function getDocument(tenantId, accountId, documentId) {
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

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, document.topicId);
  assertActorCanReadDocuments(buildActor(normalizedAccountId, normalizedTenantId), topic, member);
  return toDocumentDto(document);
}

async function updateDocument(tenantId, accountId, documentId, payload = {}) {
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

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, document.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanCreateDraftDocument(actor, topic, member);
  assertDocumentEditable(document);

  if (document.status !== 'draft') {
    throw new AppError('Only draft documents can be edited', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
    });
  }

  const updates = { updatedBy: normalizedAccountId };
  const title = pickString(payload, 'title');
  const content = pickField(payload, 'content');
  if (title) updates.title = title;
  if (content !== undefined) updates.content = content;
  if (payload.linked_requirement_ids || payload.linkedRequirementIds) {
    updates.linkedRequirementIds = payload.linked_requirement_ids || payload.linkedRequirementIds;
  }
  if (payload.linked_decision_ids || payload.linkedDecisionIds) {
    updates.linkedDecisionIds = payload.linked_decision_ids || payload.linkedDecisionIds;
  }

  const row = await documentRepository.updateById(normalizedDocumentId, normalizedTenantId, updates);
  const dto = toDocumentDto(row);
  emitDocumentUpdated(topic._id, dto);
  await emitTruthPanelUpdate(actor, topic);
  return dto;
}

async function submitDocumentReview(tenantId, accountId, documentId) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedDocumentId = assertObjectId(documentId, 'documentId');

  const document = await documentRepository.findById(normalizedDocumentId, normalizedTenantId);
  if (!document) {
    throw new AppError('Document not found', { status: 404, code: discussFlowErrorCodes.DISCUSS_FLOW_DOCUMENT_NOT_FOUND });
  }

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, document.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanSubmitForReview(actor, topic, member);
  assertDocumentTransition(document.status, 'review');

  const row = await documentRepository.updateById(normalizedDocumentId, normalizedTenantId, {
    status: 'review',
    reviewedBy: normalizedAccountId,
    reviewedAt: new Date(),
    updatedBy: normalizedAccountId,
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'document_review_submitted',
    actorId: normalizedAccountId,
    payload: { document_id: String(row._id) },
  });

  const dto = toDocumentDto(row);
  emitDocumentReviewSubmitted(topic._id, dto);
  await emitTruthPanelUpdate(actor, topic);
  return dto;
}

async function lockDocument(tenantId, accountId, documentId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedDocumentId = assertObjectId(documentId, 'documentId');

  const document = await documentRepository.findById(normalizedDocumentId, normalizedTenantId);
  if (!document) {
    throw new AppError('Document not found', { status: 404, code: discussFlowErrorCodes.DISCUSS_FLOW_DOCUMENT_NOT_FOUND });
  }

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, document.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanApproveOrLock(actor, topic, member);
  assertDocumentTransition(document.status, 'locked');

  const changeReason = pickString(payload, 'change_reason', 'changeReason');
  const versionRow = await documentVersionRepository.create({
    tenantId: normalizedTenantId,
    documentId: document._id,
    topicId: topic._id,
    version: document.version,
    title: document.title,
    content: document.content,
    contentFormat: document.contentFormat,
    status: 'locked',
    changeReason,
    createdBy: normalizedAccountId,
  });

  const row = await documentRepository.updateById(normalizedDocumentId, normalizedTenantId, {
    status: 'locked',
    lockedBy: normalizedAccountId,
    lockedAt: new Date(),
    changeReason,
    updatedBy: normalizedAccountId,
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'document_locked',
    actorId: normalizedAccountId,
    payload: { document_id: String(row._id), version: row.version },
  });
  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'truth_updated',
    actorId: normalizedAccountId,
    payload: { entity_type: 'document', entity_id: String(row._id), status: 'locked' },
  });

  const dto = toDocumentDto(row);
  emitDocumentLocked(topic._id, dto);
  emitDocumentVersionCreated(topic._id, dto, toDocumentVersionDto(versionRow));
  await emitTruthPanelUpdate(actor, topic);
  return { document: dto, version: toDocumentVersionDto(versionRow) };
}

async function createDocumentNewVersion(tenantId, accountId, documentId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedDocumentId = assertObjectId(documentId, 'documentId');

  const document = await documentRepository.findById(normalizedDocumentId, normalizedTenantId);
  if (!document) {
    throw new AppError('Document not found', { status: 404, code: discussFlowErrorCodes.DISCUSS_FLOW_DOCUMENT_NOT_FOUND });
  }

  if (document.status !== 'locked') {
    throw new AppError('New version can only be created from locked document', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
    });
  }

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, document.topicId);
  const actor = buildActor(normalizedAccountId, normalizedTenantId);
  assertActorCanApproveOrLock(actor, topic, member);

  const changeReason = pickString(payload, 'change_reason', 'changeReason') || 'New version from locked document';
  const nextVersion = (document.version || 1) + 1;
  const slug = await ensureUniqueSlug(
    `${document.slug}-v${nextVersion}`,
    (candidate) => documentRepository.slugExists(topic._id, candidate)
  );

  const row = await documentRepository.create({
    tenantId: normalizedTenantId,
    workspaceId: topic.workspaceId,
    topicId: topic._id,
    title: document.title,
    slug,
    documentType: document.documentType,
    status: 'draft',
    content: document.content,
    contentFormat: document.contentFormat,
    version: nextVersion,
    parentDocumentId: document._id,
    source: document.source,
    linkedRequirementIds: document.linkedRequirementIds || [],
    linkedDecisionIds: document.linkedDecisionIds || [],
    linkedQuestionIds: document.linkedQuestionIds || [],
    linkedMessageIds: document.linkedMessageIds || [],
    changeReason,
    createdBy: normalizedAccountId,
    updatedBy: normalizedAccountId,
    metadata: { ...(document.metadata || {}), parent_version: document.version },
  });

  await topicRepository.incrementCounter(topic._id, normalizedTenantId, 'documentCount', 1);
  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'document_version_created',
    actorId: normalizedAccountId,
    payload: { document_id: String(row._id), parent_document_id: String(document._id), version: nextVersion },
  });

  const dto = toDocumentDto(row);
  emitDocumentVersionCreated(topic._id, dto, { version: nextVersion, parent_document_id: String(document._id) });
  await emitTruthPanelUpdate(actor, topic);
  return dto;
}

async function listDocumentVersions(tenantId, accountId, documentId) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const normalizedDocumentId = assertObjectId(documentId, 'documentId');

  const document = await documentRepository.findById(normalizedDocumentId, normalizedTenantId);
  if (!document) {
    throw new AppError('Document not found', { status: 404, code: discussFlowErrorCodes.DISCUSS_FLOW_DOCUMENT_NOT_FOUND });
  }

  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, document.topicId);
  assertActorCanReadDocuments(buildActor(normalizedAccountId, normalizedTenantId), topic, member);

  const items = await documentVersionRepository.listByDocument(document._id);
  return { items: items.map(toDocumentVersionDto) };
}

async function createDraftFromAiResult({
  tenantId,
  topicId,
  workspaceId,
  accountId,
  aiJobId,
  extraction,
  documentType,
  sourceReviewItemIds = [],
}) {
  const title = extraction.title || 'Generated document';
  const slug = await ensureUniqueSlug(title, (candidate) => documentRepository.slugExists(topicId, candidate));

  const row = await documentRepository.create({
    tenantId,
    workspaceId,
    topicId,
    title,
    slug,
    documentType: extraction.document_type || documentType || 'custom',
    status: 'draft',
    content: extraction.content_markdown || extraction.content || '',
    contentFormat: 'markdown',
    version: 1,
    source: 'ai_generated',
    sourceAiJobId: aiJobId,
    sourceReviewItemIds,
    metadata: {
      sections: extraction.sections || [],
      linked_requirement_refs: extraction.linked_requirement_refs || [],
      linked_decision_refs: extraction.linked_decision_refs || [],
      unresolved_questions: extraction.unresolved_questions || [],
      assumptions: extraction.assumptions || [],
    },
    createdBy: accountId,
    updatedBy: accountId,
  });

  await topicRepository.incrementCounter(topicId, tenantId, 'documentCount', 1);
  await timelineService.recordEvent({
    topicId,
    tenantId,
    eventType: 'document_generated',
    actorId: accountId,
    payload: { document_id: String(row._id), ai_job_id: aiJobId ? String(aiJobId) : null },
  });

  return toDocumentDto(row);
}

module.exports = {
  createDocument,
  listDocuments,
  getDocument,
  updateDocument,
  submitDocumentReview,
  lockDocument,
  createDocumentNewVersion,
  listDocumentVersions,
  createDraftFromAiResult,
};
