const crypto = require('crypto');
const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const { aiDispatcher } = require('../../ai');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const importBatchRepository = require('../repositories/discussFlowImportBatch.repository');
const messageRepository = require('../repositories/discussFlowMessage.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const workspaceRepository = require('../repositories/discussFlowWorkspace.repository');
const topicService = require('./topic.service');
const timelineService = require('./timeline.service');
const { parseImportChat } = require('../helpers/whatsappParser.helper');
const { toImportBatchDto } = require('../dto/discussFlow.dto');
const { pickString, pickBoolean } = require('../helpers/payload.helper');
const { assertTopicWrite } = require('../helpers/discussFlowPermission.helper');
const { IMPORT_SOURCE_TYPES } = require('../constants/discussFlow.constants');
const {
  emitImportCreated,
  emitImportMessagesSaved,
  emitRightPanelUpdated,
} = require('../helpers/discussFlowSocketEvents.helper');
const panelService = require('./panel.service');

const SOURCE_TO_MESSAGE_SOURCE = {
  whatsapp: 'imported_whatsapp',
  slack: 'imported_slack',
  email: 'imported_email',
  meeting_transcript: 'manual',
  manual_paste: 'manual',
  other: 'manual',
};

function hashRawText(rawText) {
  return crypto.createHash('sha256').update(String(rawText)).digest('hex');
}

function buildPreview(rawText) {
  const text = String(rawText || '');
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

function resolveImportContent(rawText, sourceType) {
  const parsed = parseImportChat(rawText, sourceType);

  if (parsed.messages.length) {
    const parseMode = parsed.parseWarnings.some((warning) => String(warning.message || '').includes('fallback'))
      ? 'fallback'
      : 'structured';
    return { ...parsed, parseMode };
  }

  return {
    messages: [{
      ref: 'import-raw',
      senderName: 'Imported',
      content: rawText,
      originalTimestamp: null,
      createdAt: null,
      format: 'ai_raw',
    }],
    participants: ['Imported'],
    parseWarnings: [{
      line: 0,
      message: 'Saved as raw import; AI will interpret using source_type',
    }],
    parseMode: 'ai_raw',
  };
}

function mapParsedMessages(topic, batch, parsed, sourceType, parseMode = 'structured') {
  const messageSource = SOURCE_TO_MESSAGE_SOURCE[sourceType] || 'manual';
  const sourceLabel = sourceType === 'whatsapp' ? 'WhatsApp Import' : `${sourceType} import`;

  return parsed.messages.map((row, index) => ({
    topicId: topic._id,
    tenantId: topic.tenantId,
    authorType: 'imported',
    authorName: row.senderName,
    messageType: 'message',
    messageStatus: 'active',
    source: messageSource,
    sourceLabel,
    importBatchId: String(batch._id),
    clientMessageId: row.ref || `import-${index + 1}`,
    aiSuggestionStatus: 'none',
    content: row.content,
    metadata: {
      originalTimestamp: row.originalTimestamp || null,
      importRef: row.ref || null,
      senderName: row.senderName,
      parseMode,
      sourceType,
    },
    createdAt: row.createdAt || undefined,
  }));
}

async function emitPanelSnapshot(actor, topic) {
  const panel = await panelService.getTopicPanel({ ...actor, topic }, topic._id);
  emitRightPanelUpdated(topic._id, {
    counts: panel.counts,
    participant_count: panel.participant_count,
    last_activity: panel.last_activity,
    ai_jobs: panel.ai_jobs,
    ai_review: panel.ai_review,
  });
}

async function importChat(tenantId, accountId, topicId, payload = {}) {
  const normalizedTenantId = assertObjectId(tenantId, 'tenantId');
  const normalizedAccountId = assertObjectId(accountId, 'accountId');
  const { topic, member } = await topicService.getTopicContext(normalizedTenantId, normalizedAccountId, topicId);
  assertTopicWrite(normalizedAccountId, topic, member);

  const rawText = pickString(payload, 'raw_text', 'rawText');
  if (!rawText) {
    throw new AppError('rawText is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { raw_text: 'raw_text is required' },
    });
  }

  const sourceType = pickString(payload, 'source_type', 'sourceType') || 'whatsapp';
  if (!IMPORT_SOURCE_TYPES.includes(sourceType)) {
    throw new AppError('Invalid source type', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { allowed: IMPORT_SOURCE_TYPES },
    });
  }

  const runAiExtraction = pickBoolean(payload, 'run_ai_extraction', 'runAiExtraction') !== false;

  const workspace = await workspaceRepository.findById(topic.workspaceId, normalizedTenantId);

  let batch = await importBatchRepository.create({
    tenantId: normalizedTenantId,
    workspaceId: topic.workspaceId,
    topicId: topic._id,
    createdBy: normalizedAccountId,
    actorType: 'user',
    sourceType,
    rawTextPreview: buildPreview(rawText),
    rawTextHash: hashRawText(rawText),
    status: 'created',
  });

  emitImportCreated(topic._id, toImportBatchDto(batch));

  batch = await importBatchRepository.updateById(batch._id, normalizedTenantId, { status: 'parsing' });
  const parsed = resolveImportContent(rawText, sourceType);

  const messagePayloads = mapParsedMessages(topic, batch, parsed, sourceType, parsed.parseMode);
  const savedMessages = await messageRepository.createMany(messagePayloads);

  await topicRepository.incrementCounter(topic._id, normalizedTenantId, 'messageCount', savedMessages.length);
  await topicRepository.touchMessageActivity(topic._id, normalizedTenantId);

  batch = await importBatchRepository.updateById(batch._id, normalizedTenantId, {
    status: 'messages_saved',
    messageCount: savedMessages.length,
    participantCount: parsed.participants.length,
    stats: {
      parse_mode: parsed.parseMode,
      parse_warnings: parsed.parseWarnings,
      message_refs: savedMessages.map((row) => ({
        id: String(row._id),
        client_message_id: row.clientMessageId,
      })),
    },
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: normalizedTenantId,
    eventType: 'chat_imported',
    actorId: normalizedAccountId,
    payload: {
      import_batch_id: String(batch._id),
      source_type: sourceType,
      message_count: savedMessages.length,
      participant_count: parsed.participants.length,
    },
  });

  emitImportMessagesSaved(topic._id, toImportBatchDto(batch), {
    saved_messages_count: savedMessages.length,
  });

  const actor = {
    actorType: 'user',
    actorId: String(normalizedAccountId),
    tenantId: String(normalizedTenantId),
    topic,
    member,
  };
  await emitPanelSnapshot(actor, topic);

  let aiJobId = null;

  if (runAiExtraction) {
    batch = await importBatchRepository.updateById(batch._id, normalizedTenantId, { status: 'ai_queued' });

    const aiResponse = await aiDispatcher.execute({
      action: 'DISCUSS_IMPORT_CHAT',
      actor: normalizedAccountId,
      tenantId: normalizedTenantId,
      sourceModule: 'discuss-flow',
      sourceId: String(topic._id),
      context: {
        topicId: String(topic._id),
        workspaceId: String(topic.workspaceId),
        importBatchId: String(batch._id),
        importBatch: { _id: batch._id, sourceType: batch.sourceType },
        sourceType,
        parseMode: parsed.parseMode,
        participants: parsed.participants,
        messageCount: savedMessages.length,
      },
      input: {
        source_type: sourceType,
        parse_mode: parsed.parseMode,
        raw_text: rawText,
        rawText,
        parsed_messages: savedMessages.map((row) => ({
          id: String(row._id),
          ref: row.clientMessageId,
          author_name: row.authorName,
          content: row.content,
          created_at: row.createdAt,
        })),
        parsedMessages: savedMessages.map((row) => ({
          id: String(row._id),
          ref: row.clientMessageId,
          author_name: row.authorName,
          content: row.content,
          created_at: row.createdAt,
        })),
        forceAsync: true,
      },
    });

    if (aiResponse.async && aiResponse.job_id) {
      aiJobId = aiResponse.job_id;
      batch = await importBatchRepository.updateById(batch._id, normalizedTenantId, {
        status: 'ai_running',
        aiJobId,
      });
    }
  }

  return {
    import_batch_id: String(batch._id),
    import_batch: toImportBatchDto(batch),
    saved_messages_count: savedMessages.length,
    participants: parsed.participants,
    parse_mode: parsed.parseMode,
    parse_warnings: parsed.parseWarnings,
    ai_job_id: aiJobId,
  };
}

module.exports = {
  importChat,
  hashRawText,
  mapParsedMessages,
  resolveImportContent,
};
