const { assertObjectId } = require('../../../kernel/validators/objectId');
const importBatchRepository = require('../repositories/discussFlowImportBatch.repository');
const messageRepository = require('../repositories/discussFlowMessage.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const aiReviewItemRepository = require('../repositories/discussFlowAiReviewItem.repository');
const timelineService = require('./timeline.service');
const { toImportBatchDto } = require('../dto/discussFlow.dto');
const {
  emitAiReviewReady,
  emitAiReviewFailed,
} = require('../helpers/discussFlowSocketEvents.helper');
const { emitTruthPanelUpdate } = require('../helpers/truthPanel.helper');
const documentRepository = require('../repositories/discussFlowDocument.repository');
const { DISCUSS_SOURCE_MODULES } = require('./aiJobQuery.service');

function isDiscussFlowJob(job) {
  return DISCUSS_SOURCE_MODULES.includes(job.sourceModule);
}

function extractAiResult(job) {
  const payload = job.result || {};
  return payload.result || payload;
}

function resolveLinkedMessageIds(topicId, refs = [], refMap = {}) {
  if (!Array.isArray(refs)) return [];
  return refs
    .map((ref) => refMap[String(ref)] || refMap[ref])
    .filter(Boolean)
    .map((id) => assertObjectId(id, 'linkedMessageId'));
}

async function buildRefMap(topicId, importBatchId) {
  const messages = await messageRepository.listByImportBatch(topicId, importBatchId);
  const map = {};
  messages.forEach((row) => {
    if (row.clientMessageId) map[row.clientMessageId] = String(row._id);
    map[String(row._id)] = String(row._id);
  });
  return map;
}

function normalizeConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed > 1) return Math.min(parsed / 100, 1);
  return Math.max(0, Math.min(parsed, 1));
}

function buildReviewItemRecords({
  tenantId,
  workspaceId,
  topicId,
  importBatchId,
  messageId,
  aiJobId,
  extraction,
  refMap,
}) {
  const items = [];
  const base = {
    tenantId,
    workspaceId,
    topicId,
    importBatchId: importBatchId || null,
    messageId: messageId || null,
    createdByAiJobId: aiJobId,
    status: 'pending',
  };

  if (extraction.summary) {
    items.push({
      ...base,
      type: 'summary',
      title: extraction.summary.title || 'Discussion summary',
      content: extraction.summary.content || '',
      reasoning: Array.isArray(extraction.summary.key_points)
        ? extraction.summary.key_points.join('\n')
        : null,
      confidence: normalizeConfidence(extraction.summary.confidence),
      linkedMessageIds: resolveLinkedMessageIds(topicId, extraction.summary.linked_message_refs, refMap),
    });
  }

  (extraction.requirements || []).forEach((row) => {
    items.push({
      ...base,
      type: 'requirement',
      title: row.title || row.text || 'Requirement',
      content: row.description || row.text || '',
      suggestedPriority: row.priority || 'medium',
      confidence: normalizeConfidence(row.confidence),
      linkedMessageIds: resolveLinkedMessageIds(topicId, row.linked_message_refs, refMap),
    });
  });

  (extraction.questions || []).forEach((row) => {
    items.push({
      ...base,
      type: 'question',
      title: row.question || row.title || 'Question',
      content: row.context || row.answer || '',
      confidence: normalizeConfidence(row.confidence),
      linkedMessageIds: resolveLinkedMessageIds(topicId, row.linked_message_refs, refMap),
    });
  });

  (extraction.decisions || []).forEach((row) => {
    items.push({
      ...base,
      type: 'decision',
      title: row.title || 'Decision',
      content: [row.context, row.impact].filter(Boolean).join('\n\n'),
      confidence: normalizeConfidence(row.confidence),
      linkedMessageIds: resolveLinkedMessageIds(topicId, row.linked_message_refs, refMap),
    });
  });

  (extraction.risks || []).forEach((row) => {
    items.push({
      ...base,
      type: 'risk',
      title: row.title || row.risk || 'Risk',
      content: row.description || row.context || '',
      confidence: normalizeConfidence(row.confidence),
      linkedMessageIds: resolveLinkedMessageIds(topicId, row.linked_message_refs, refMap),
    });
  });

  (extraction.task_candidates || []).forEach((row) => {
    items.push({
      ...base,
      type: 'task_candidate',
      title: row.title || 'Task candidate',
      content: row.description || row.context || '',
      suggestedPriority: row.priority || 'medium',
      confidence: normalizeConfidence(row.confidence),
      linkedMessageIds: resolveLinkedMessageIds(topicId, row.linked_message_refs, refMap),
    });
  });

  (extraction.next_actions || []).forEach((row) => {
    items.push({
      ...base,
      type: 'next_action',
      title: row.title || row.label || 'Next action',
      content: row.description || row.action || '',
      suggestedPriority: row.priority || 'medium',
      confidence: normalizeConfidence(row.confidence),
      linkedMessageIds: resolveLinkedMessageIds(topicId, row.linked_message_refs, refMap),
    });
  });

  return items;
}

async function createReviewItemsFromExtraction(params) {
  const items = buildReviewItemRecords(params);
  if (!items.length) return [];
  return aiReviewItemRepository.createMany(items);
}

async function emitReviewPanel(topic, actorId = null) {
  await emitTruthPanelUpdate(
    {
      actorType: 'user',
      actorId: String(actorId || topic.ownerId),
      tenantId: String(topic.tenantId),
    },
    topic
  );
}

async function handleImportChatCompleted(job, extraction) {
  const context = job.contextSnapshot || {};
  const importBatchId = context.importBatchId || context.importBatch?._id;
  if (!importBatchId) return null;

  const batch = await importBatchRepository.findById(importBatchId, job.tenantId);
  if (!batch) return null;

  if (batch.status === 'review_ready') {
    return batch;
  }

  const existingItems = await aiReviewItemRepository.countByAiJobId(job._id);
  if (existingItems > 0) {
    return batch;
  }

  const refMap = await buildRefMap(batch.topicId, batch._id);
  const createdItems = await createReviewItemsFromExtraction({
    tenantId: batch.tenantId,
    workspaceId: batch.workspaceId,
    topicId: batch.topicId,
    importBatchId: batch._id,
    aiJobId: job._id,
    extraction,
    refMap,
  });

  const summaryItem = createdItems.find((row) => row.type === 'summary');

  const updatedBatch = await importBatchRepository.updateById(batch._id, batch.tenantId, {
    status: 'review_ready',
    completedAt: new Date(),
    summaryId: summaryItem?._id || null,
    stats: {
      ...(batch.stats || {}),
      review_item_count: createdItems.length,
    },
  });

  await timelineService.recordEvent({
    topicId: batch.topicId,
    tenantId: batch.tenantId,
    eventType: 'import_batch_ai_ready',
    actorId: job.actorId,
    payload: {
      import_batch_id: String(batch._id),
      ai_job_id: String(job._id),
      review_item_count: createdItems.length,
    },
  });

  emitAiReviewReady(batch.topicId, {
    import_batch: toImportBatchDto(updatedBatch),
    review_item_count: createdItems.length,
    ai_job_id: String(job._id),
  });

  const topic = await topicRepository.findById(batch.topicId, batch.tenantId);
  if (topic) await emitReviewPanel(topic);

  return updatedBatch;
}

async function handleImportChatFailed(job, error) {
  const context = job.contextSnapshot || {};
  const importBatchId = context.importBatchId || context.importBatch?._id;
  if (!importBatchId) return null;

  const batch = await importBatchRepository.findById(importBatchId, job.tenantId);
  if (!batch) return null;

  if (batch.status === 'review_ready') {
    return batch;
  }

  const updatedBatch = await importBatchRepository.updateById(batch._id, batch.tenantId, {
    status: 'failed',
    error: {
      message: error?.message || job.error?.message || 'AI extraction failed',
      code: error?.code || job.error?.code || null,
    },
    completedAt: new Date(),
  });

  await timelineService.recordEvent({
    topicId: batch.topicId,
    tenantId: batch.tenantId,
    eventType: 'import_batch_ai_failed',
    actorId: job.actorId,
    payload: {
      import_batch_id: String(batch._id),
      ai_job_id: String(job._id),
    },
  });

  emitAiReviewFailed(batch.topicId, {
    import_batch: toImportBatchDto(updatedBatch),
    ai_job_id: String(job._id),
    error: updatedBatch.error,
  });

  return updatedBatch;
}

async function handleAnalyzeMessageCompleted(job, extraction) {
  const context = job.contextSnapshot || {};
  const topicId = context.topicId || job.sourceId;
  const messageId = context.messageId;
  if (!topicId) return null;

  const topic = await topicRepository.findById(topicId, job.tenantId);
  if (!topic) return null;

  const existingItems = await aiReviewItemRepository.countByAiJobId(job._id);
  if (existingItems > 0) {
    return aiReviewItemRepository.list(topic._id, { tenantId: job.tenantId, limit: existingItems, skip: 0 })
      .then((result) => result.items);
  }

  const refMap = messageId ? { [String(messageId)]: String(messageId) } : {};
  const createdItems = await createReviewItemsFromExtraction({
    tenantId: job.tenantId,
    workspaceId: topic.workspaceId,
    topicId: topic._id,
    messageId: messageId || null,
    aiJobId: job._id,
    extraction,
    refMap,
  });

  if (messageId && createdItems.length) {
    const messageRepository = require('../repositories/discussFlowMessage.repository');
    await messageRepository.updateById(messageId, topic._id, { aiSuggestionStatus: 'ready' });
  }

  emitAiReviewReady(topic._id, {
    message_id: messageId ? String(messageId) : null,
    review_item_count: createdItems.length,
    ai_job_id: String(job._id),
  });

  await emitReviewPanel(topic);
  return createdItems;
}

async function handleJobCompleted(jobDoc) {
  if (!isDiscussFlowJob(jobDoc)) return null;

  const job = jobDoc.toObject ? jobDoc.toObject() : jobDoc;
  const extraction = extractAiResult(job);

  if (job.action === 'DISCUSS_IMPORT_CHAT') {
    return handleImportChatCompleted(job, extraction);
  }

  if (job.action === 'DISCUSS_ANALYZE_MESSAGE') {
    return handleAnalyzeMessageCompleted(job, extraction);
  }

  if (job.action === 'DISCUSS_GENERATE_DOCUMENT') {
    return handleGenerateDocumentCompleted(job, extraction);
  }

  return null;
}

async function handleGenerateDocumentCompleted(job, extraction) {
  const context = job.contextSnapshot || {};
  const topicId = context.topicId || job.sourceId;
  if (!topicId) return null;

  const topic = await topicRepository.findById(topicId, job.tenantId);
  if (!topic) return null;

  const existingDocument = await documentRepository.findBySourceAiJobId(job._id, job.tenantId);
  if (existingDocument) {
    const { toDocumentDto } = require('../dto/discussFlow.dto');
    return toDocumentDto(existingDocument);
  }

  const documentService = require('./document.service');
  const { emitDocumentDraftCreated } = require('../helpers/discussFlowSocketEvents.helper');

  const document = await documentService.createDraftFromAiResult({
    tenantId: job.tenantId,
    topicId: topic._id,
    workspaceId: topic.workspaceId,
    accountId: job.actorId,
    aiJobId: job._id,
    extraction,
    documentType: context.documentType || extraction.document_type,
  });

  emitDocumentDraftCreated(topic._id, document, { ai_job_id: String(job._id) });
  await emitTruthPanelUpdate(
    { actorType: 'user', actorId: String(job.actorId), tenantId: String(job.tenantId) },
    topic
  );

  return document;
}

async function handleJobFailed(jobDoc) {
  if (!isDiscussFlowJob(jobDoc)) return null;

  const job = jobDoc.toObject ? jobDoc.toObject() : jobDoc;

  if (job.action === 'DISCUSS_IMPORT_CHAT') {
    return handleImportChatFailed(job, job.error);
  }

  if (job.action === 'DISCUSS_ANALYZE_MESSAGE') {
    const context = job.contextSnapshot || {};
    const topicId = context.topicId || job.sourceId;
    if (topicId) {
      emitAiReviewFailed(topicId, {
        message_id: context.messageId ? String(context.messageId) : null,
        ai_job_id: String(job._id),
        error: job.error,
      });
    }
  }

  return null;
}

module.exports = {
  handleJobCompleted,
  handleJobFailed,
  buildReviewItemRecords,
  createReviewItemsFromExtraction,
  extractAiResult,
};
