const { AppError } = require('../../../kernel/errors');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const discussFlowErrorCodes = require('../errors/discussFlowErrorCodes');
const messageRepository = require('../repositories/discussFlowMessage.repository');
const topicRepository = require('../repositories/discussFlowTopic.repository');
const topicService = require('./topic.service');
const timelineService = require('./timeline.service');
const panelService = require('./panel.service');
const { toMessageDto } = require('../dto/discussFlow.dto');
const { pickString, pickArray, parsePagination } = require('../helpers/payload.helper');
const {
  assertActorTopicWrite,
  assertActorTopicRead,
  assertActorCanReply,
} = require('../helpers/discussFlowPermission.helper');
const { buildUserActor } = require('../helpers/discussFlowActor.helper');
const {
  MESSAGE_TYPES,
  MESSAGE_SOURCES,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} = require('../constants/discussFlow.constants');
const {
  emitMessageCreated,
  emitMessageUpdated,
  emitMessageDeleted,
  emitRightPanelUpdated,
} = require('../helpers/discussFlowSocketEvents.helper');

async function resolveActorContext(actor, topicId) {
  if (actor.topic && String(actor.topic._id) === String(topicId)) {
    return { topic: actor.topic, member: actor.member || null };
  }

  if (actor.actorType === 'guest') {
    const topic = await topicRepository.findById(topicId, actor.tenantId);
    return { topic, member: null };
  }

  return topicService.getTopicContext(actor.tenantId, actor.actorId, topicId);
}

async function emitPanelUpdate(actor, topic) {
  const panel = await panelService.getTopicPanel(
    { ...actor, topic, member: actor.member || null },
    topic._id
  );
  emitRightPanelUpdated(topic._id, {
    counts: panel.counts,
    participant_count: panel.participant_count,
    last_activity: panel.last_activity,
  });
}

async function createMessageWithActor(actor, topicId, payload = {}, options = {}) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const { topic, member } = await resolveActorContext(actor, normalizedTopicId);
  assertActorTopicWrite(actor, topic, member);

  const content = pickString(payload, 'content');
  if (!content) {
    throw new AppError('Message content is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { content: 'content is required' },
    });
  }

  const messageType = pickString(payload, 'message_type', 'messageType') || 'message';
  if (!MESSAGE_TYPES.includes(messageType)) {
    throw new AppError('Invalid message type', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { allowed: MESSAGE_TYPES },
    });
  }

  const source = pickString(payload, 'source') || 'manual';
  if (!MESSAGE_SOURCES.includes(source)) {
    throw new AppError('Invalid message source', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      details: { allowed: MESSAGE_SOURCES },
    });
  }

  const replyToMessageId = payload.reply_to_message_id || payload.replyToMessageId || null;
  if (replyToMessageId) {
    const parent = await messageRepository.findById(replyToMessageId, topic._id);
    if (!parent) {
      throw new AppError('Reply target message not found', {
        status: 404,
        code: discussFlowErrorCodes.DISCUSS_FLOW_MESSAGE_NOT_FOUND,
      });
    }
  }

  const aiSuggestionsEnabled = topic.settings?.aiSuggestionsEnabled === true;
  const aiSuggestionStatus = aiSuggestionsEnabled ? 'pending' : 'none';

  const isGuest = options.isGuest || actor.actorType === 'guest';
  const row = await messageRepository.create({
    topicId: topic._id,
    tenantId: assertObjectId(actor.tenantId, 'tenantId'),
    threadId: payload.thread_id || payload.threadId || null,
    parentMessageId: payload.parent_message_id || payload.parentMessageId || null,
    replyToMessageId: replyToMessageId || null,
    authorId: isGuest ? null : assertObjectId(actor.actorId, 'authorId'),
    authorType: isGuest ? 'guest' : 'account',
    authorName: isGuest ? (actor.displayName || 'Guest') : null,
    messageType,
    messageStatus: 'active',
    source: isGuest ? 'manual' : source,
    sourceLabel: pickString(payload, 'source_label', 'sourceLabel'),
    importBatchId: pickString(payload, 'import_batch_id', 'importBatchId'),
    clientMessageId: pickString(payload, 'client_message_id', 'clientMessageId'),
    aiSuggestionStatus,
    content,
    mentions: pickArray(payload, 'mentions') || [],
    attachments: pickArray(payload, 'attachments') || [],
    metadata: payload.metadata || {},
  });

  const updatedTopic = await topicRepository.incrementCounter(topic._id, actor.tenantId, 'messageCount', 1);
  await topicRepository.touchMessageActivity(topic._id, actor.tenantId);

  const timelineType = isGuest ? 'guest_message_created' : 'message_created';
  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: actor.tenantId,
    eventType: timelineType,
    actorId: isGuest ? null : actor.actorId,
    payload: {
      message_id: String(row._id),
      message_type: messageType,
      guest_name: isGuest ? actor.displayName : null,
    },
  });

  const messageDto = toMessageDto(row);
  emitMessageCreated(topic._id, messageDto, { actor_type: actor.actorType });
  await emitPanelUpdate({ ...actor, topic: updatedTopic, member }, updatedTopic);

  return messageDto;
}

async function createMessage(tenantId, accountId, topicId, payload = {}) {
  const actor = await buildUserActor(accountId, tenantId, topicId);
  return createMessageWithActor(actor, topicId, payload);
}

async function listMessages(tenantId, accountId, topicId, query = {}) {
  const actor = await buildUserActor(accountId, tenantId, topicId);
  return listMessagesWithActor(actor, topicId, query);
}

async function listMessagesWithActor(actor, topicId, query = {}) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const { topic, member } = await resolveActorContext(actor, normalizedTopicId);
  assertActorTopicRead(actor, topic, member);

  const { limit, page, skip } = parsePagination(query, { limit: DEFAULT_PAGE_LIMIT, max: MAX_PAGE_LIMIT });
  const { items, total } = await messageRepository.list(topic._id, {
    search: pickString(query, 'q', 'search'),
    limit,
    skip,
  });

  return {
    items: items.map(toMessageDto),
    meta: { page, limit, total },
  };
}

async function updateMessageWithActor(actor, topicId, messageId, payload = {}) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const normalizedMessageId = assertObjectId(messageId, 'messageId');
  const { topic, member } = await resolveActorContext(actor, normalizedTopicId);
  assertActorTopicWrite(actor, topic, member);

  const existing = await messageRepository.findById(normalizedMessageId, topic._id);
  if (!existing) {
    throw new AppError('Message not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_MESSAGE_NOT_FOUND,
    });
  }

  if (actor.actorType === 'guest') {
    throw new AppError('Guests cannot edit messages', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }

  const content = pickString(payload, 'content');
  if (!content) {
    throw new AppError('Message content is required', {
      status: 400,
      code: discussFlowErrorCodes.DISCUSS_FLOW_INVALID_STATUS,
      fields: { content: 'content is required' },
    });
  }

  const row = await messageRepository.updateById(normalizedMessageId, topic._id, {
    content,
    isEdited: true,
    editedAt: new Date(),
    messageStatus: 'edited',
  });

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: actor.tenantId,
    eventType: 'message_updated',
    actorId: actor.actorId,
    payload: { message_id: String(row._id) },
  });

  const messageDto = toMessageDto(row);
  emitMessageUpdated(topic._id, messageDto);
  return messageDto;
}

async function deleteMessageWithActor(actor, topicId, messageId) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const normalizedMessageId = assertObjectId(messageId, 'messageId');
  const { topic, member } = await resolveActorContext(actor, normalizedTopicId);
  assertActorTopicWrite(actor, topic, member);

  if (actor.actorType === 'guest') {
    throw new AppError('Guests cannot delete messages', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }

  const existing = await messageRepository.findById(normalizedMessageId, topic._id);
  if (!existing) {
    throw new AppError('Message not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_MESSAGE_NOT_FOUND,
    });
  }

  const row = await messageRepository.softDeleteById(normalizedMessageId, topic._id);
  const updatedTopic = await topicRepository.incrementCounter(topic._id, actor.tenantId, 'messageCount', -1);

  await timelineService.recordEvent({
    topicId: topic._id,
    tenantId: actor.tenantId,
    eventType: 'message_deleted',
    actorId: actor.actorId,
    payload: { message_id: String(row._id) },
  });

  const messageDto = toMessageDto(row);
  emitMessageDeleted(topic._id, messageDto);
  await emitPanelUpdate({ ...actor, topic: updatedTopic, member }, updatedTopic);
  return messageDto;
}

async function replyToMessageWithActor(actor, topicId, messageId, payload = {}) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const normalizedMessageId = assertObjectId(messageId, 'messageId');
  const { topic, member } = await resolveActorContext(actor, normalizedTopicId);
  assertActorCanReply(actor, topic, member);

  const parent = await messageRepository.findById(normalizedMessageId, topic._id);
  if (!parent) {
    throw new AppError('Message not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_MESSAGE_NOT_FOUND,
    });
  }

  return createMessageWithActor(actor, topic._id, {
    ...payload,
    reply_to_message_id: String(parent._id),
    thread_id: parent.threadId ? String(parent.threadId) : String(parent._id),
    parent_message_id: String(parent._id),
  }, { isGuest: actor.actorType === 'guest' });
}

async function getAiSuggestions(actor, topicId, messageId) {
  const aiReviewItemService = require('./aiReviewItem.service');
  return aiReviewItemService.getMessageSuggestions(actor, topicId, messageId);
}

async function analyzeMessageWithActor(actor, topicId, messageId) {
  const { aiDispatcher } = require('../../ai');
  const discussFlowAiJobHandler = require('./discussFlowAiJobHandler.service');
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const normalizedMessageId = assertObjectId(messageId, 'messageId');
  const { topic, member } = await resolveActorContext(actor, normalizedTopicId);
  assertActorTopicRead(actor, topic, member);

  if (actor.actorType === 'guest') {
    throw new AppError('Guests cannot run AI analysis', {
      status: 403,
      code: discussFlowErrorCodes.DISCUSS_FLOW_FORBIDDEN,
    });
  }

  const message = await messageRepository.findById(normalizedMessageId, topic._id);
  if (!message) {
    throw new AppError('Message not found', {
      status: 404,
      code: discussFlowErrorCodes.DISCUSS_FLOW_MESSAGE_NOT_FOUND,
    });
  }

  await messageRepository.updateById(normalizedMessageId, topic._id, { aiSuggestionStatus: 'pending' });

  const aiResponse = await aiDispatcher.execute({
    action: 'DISCUSS_ANALYZE_MESSAGE',
    actor: actor.actorId,
    tenantId: actor.tenantId,
    sourceModule: 'discuss-flow',
    sourceId: String(topic._id),
    context: {
      topicId: String(topic._id),
      messageId: String(message._id),
    },
    input: {
      message: {
        id: String(message._id),
        content: message.content,
        author_name: message.authorName,
        source: message.source,
      },
      topic_title: topic.title,
    },
  });

  if (aiResponse.async) {
    return {
      status: 'queued',
      job_id: aiResponse.job_id,
      poll_url: aiResponse.poll_url,
      message_id: String(message._id),
    };
  }

  const createdItems = await discussFlowAiJobHandler.handleJobCompleted({
    _id: aiResponse.job_id || null,
    tenantId: actor.tenantId,
    actorId: actor.actorId,
    sourceModule: 'discuss-flow',
    sourceId: String(topic._id),
    action: 'DISCUSS_ANALYZE_MESSAGE',
    contextSnapshot: {
      topicId: String(topic._id),
      messageId: String(message._id),
    },
    result: aiResponse,
  });

  const suggestions = await getAiSuggestions(actor, topicId, messageId);
  return {
    status: 'ready',
    message_id: String(message._id),
    job_id: aiResponse.job_id || null,
    items: suggestions.items,
    created_count: Array.isArray(createdItems) ? createdItems.length : 0,
  };
}

module.exports = {
  createMessage,
  createMessageWithActor,
  listMessages,
  listMessagesWithActor,
  updateMessageWithActor,
  deleteMessageWithActor,
  replyToMessageWithActor,
  getAiSuggestions,
  analyzeMessageWithActor,
};
