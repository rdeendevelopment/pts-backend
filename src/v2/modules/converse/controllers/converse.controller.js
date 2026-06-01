const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const converseService = require('../services/converse.service');

function actor(req) {
  return {
    userId: req.v2Converse.userId,
    displayName: req.v2Converse.displayName,
  };
}

async function listConversations(req, res) {
  const data = await converseService.listConversations(actor(req).userId);
  return sendSuccess(res, data);
}

async function createDirect(req, res) {
  const recipientUserId = req.body.recipientUserId || req.body.recipientId;
  const result = await converseService.createDirect(
    actor(req).userId,
    actor(req).displayName,
    recipientUserId
  );
  return sendSuccess(res, result.conversation, { status: result.created ? 201 : 200 });
}

async function createGroup(req, res) {
  const result = await converseService.createGroup(
    actor(req).userId,
    req.body.title,
    req.body.memberIds || []
  );
  return sendSuccess(res, result.conversation, { status: 201 });
}

async function getConversation(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const data = await converseService.getConversation(conversationId, actor(req).userId);
  return sendSuccess(res, data);
}

async function listMessages(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const data = await converseService.listMessages(conversationId, actor(req).userId, req.query);
  return sendSuccess(res, data);
}

async function sendMessage(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const data = await converseService.sendMessage(
    actor(req).userId,
    actor(req).displayName,
    conversationId,
    req.body
  );
  return sendSuccess(res, data, { status: 201 });
}

async function markRead(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const data = await converseService.markConversationRead(
    conversationId,
    actor(req).userId,
    req.body
  );
  return sendSuccess(res, data);
}

async function addParticipants(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const data = await converseService.addParticipants(
    conversationId,
    actor(req).userId,
    req.body.memberIds || req.body.userIds || []
  );
  return sendSuccess(res, data);
}

async function removeParticipant(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const userId = assertObjectId(req.params.userId, 'userId');
  const data = await converseService.removeParticipant(conversationId, actor(req).userId, userId);
  return sendSuccess(res, data);
}

async function leaveConversation(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const data = await converseService.leaveConversation(conversationId, actor(req).userId);
  return sendSuccess(res, data);
}

async function updateConversation(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  if (req.body.title !== undefined) {
    const data = await converseService.updateGroupTitle(
      conversationId,
      actor(req).userId,
      req.body.title
    );
    return sendSuccess(res, data);
  }
  const data = await converseService.updateParticipantSettings(
    conversationId,
    actor(req).userId,
    req.body
  );
  return sendSuccess(res, data);
}

async function editMessage(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const messageId = assertObjectId(req.params.messageId, 'messageId');
  const data = await converseService.editMessage(
    conversationId,
    messageId,
    actor(req).userId,
    req.body.text
  );
  return sendSuccess(res, data);
}

async function deleteMessage(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const messageId = assertObjectId(req.params.messageId, 'messageId');
  const data = await converseService.deleteMessageForEveryone(
    conversationId,
    messageId,
    actor(req).userId
  );
  return sendSuccess(res, data);
}

async function getUnreadCount(req, res) {
  const data = await converseService.getUnreadCount(actor(req).userId);
  return sendSuccess(res, data);
}

async function searchUsers(req, res) {
  const data = await converseService.searchUsers(req.query.q || req.query.query || '', actor(req).userId);
  return sendSuccess(res, data);
}

async function getOnlineUsers(req, res) {
  const userIds = converseService.getOnlineUserIds();
  return sendSuccess(res, { userIds });
}

async function getConfig(req, res) {
  return sendSuccess(res, converseService.getConfig());
}

module.exports = {
  listConversations: asyncHandler(listConversations),
  createDirect: asyncHandler(createDirect),
  createGroup: asyncHandler(createGroup),
  getConversation: asyncHandler(getConversation),
  listMessages: asyncHandler(listMessages),
  sendMessage: asyncHandler(sendMessage),
  markRead: asyncHandler(markRead),
  addParticipants: asyncHandler(addParticipants),
  removeParticipant: asyncHandler(removeParticipant),
  leaveConversation: asyncHandler(leaveConversation),
  updateConversation: asyncHandler(updateConversation),
  editMessage: asyncHandler(editMessage),
  deleteMessage: asyncHandler(deleteMessage),
  getUnreadCount: asyncHandler(getUnreadCount),
  searchUsers: asyncHandler(searchUsers),
  getOnlineUsers: asyncHandler(getOnlineUsers),
  getConfig: asyncHandler(getConfig),
};
