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
  const data = await converseService.listConversations(actor(req).userId, req.v2Auth);
  return sendSuccess(res, data);
}

async function createProjectRoom(req, res) {
  const projectId = assertObjectId(req.body.projectId, 'projectId');
  const result = await converseService.createProjectRoom(actor(req).userId, projectId, req.v2Auth);
  return sendSuccess(res, result.conversation, { status: result.created ? 201 : 200 });
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
    req.body.memberIds || [],
    req.body.avatar || null
  );
  return sendSuccess(res, result.conversation, { status: 201 });
}

async function getConversation(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const data = await converseService.getConversation(conversationId, actor(req).userId, req.v2Auth);
  return sendSuccess(res, data);
}

async function listMessages(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const data = await converseService.listMessages(conversationId, actor(req).userId, req.query, req.v2Auth);
  return sendSuccess(res, data);
}

async function sendMessage(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const data = await converseService.sendMessage(
    actor(req).userId,
    actor(req).displayName,
    conversationId,
    req.body,
    req.v2Auth
  );
  return sendSuccess(res, data, { status: 201 });
}

async function markRead(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const data = await converseService.markConversationRead(
    conversationId,
    actor(req).userId,
    req.body,
    req.v2Auth
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
    req.body,
    req.v2Auth
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
    req.body.text,
    req.v2Auth
  );
  return sendSuccess(res, data);
}

async function deleteMessage(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const messageId = assertObjectId(req.params.messageId, 'messageId');
  const data = await converseService.deleteMessageForEveryone(
    conversationId,
    messageId,
    actor(req).userId,
    req.v2Auth
  );
  return sendSuccess(res, data);
}

async function toggleReaction(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const messageId = assertObjectId(req.params.messageId, 'messageId');
  const data = await converseService.toggleReaction(
    conversationId, messageId, actor(req).userId, req.body.emoji, req.v2Auth
  );
  return sendSuccess(res, data);
}

async function getUnreadCount(req, res) {
  const data = await converseService.getUnreadCount(actor(req).userId, req.v2Auth);
  return sendSuccess(res, data);
}

async function listTeamMembers(req, res) {
  const data = await converseService.listTeamMembers(actor(req).userId, req.query);
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

async function downloadAttachment(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const messageId = assertObjectId(req.params.messageId, 'messageId');
  const attachmentIndex = parseInt(req.params.attachmentIndex, 10);

  if (Number.isNaN(attachmentIndex) || attachmentIndex < 0) {
    return res.status(400).json({ success: false, message: 'Invalid attachment index.' });
  }

  return converseService.downloadAttachment(
    conversationId,
    messageId,
    attachmentIndex,
    actor(req).userId,
    req.v2Auth,
    res
  );
}

async function search(req, res) {
  const query = req.query.q || '';
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const data = await converseService.search(query, actor(req).userId, limit, req.v2Auth);
  return sendSuccess(res, data);
}

async function saveMessage(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const messageId = assertObjectId(req.params.messageId, 'messageId');
  const data = await converseService.saveMessage(messageId, conversationId, actor(req).userId, req.v2Auth);
  return sendSuccess(res, data, { status: 201 });
}

async function unsaveMessage(req, res) {
  const messageId = assertObjectId(req.params.messageId, 'messageId');
  const data = await converseService.unsaveMessage(messageId, actor(req).userId);
  return sendSuccess(res, data);
}

async function pinMessage(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const messageId = assertObjectId(req.params.messageId, 'messageId');
  const data = await converseService.pinMessage(messageId, conversationId, actor(req).userId, req.v2Auth);
  return sendSuccess(res, data, { status: 201 });
}

async function unpinMessage(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const messageId = assertObjectId(req.params.messageId, 'messageId');
  const data = await converseService.unpinMessage(messageId, conversationId, actor(req).userId, req.v2Auth);
  return sendSuccess(res, data);
}

async function setNotificationPreference(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const { preference } = req.body;
  const data = await converseService.setNotificationPreference(conversationId, actor(req).userId, preference, req.v2Auth);
  return sendSuccess(res, data);
}

async function forwardMessage(req, res) {
  const conversationId = assertObjectId(req.params.conversationId, 'conversationId');
  const messageId = assertObjectId(req.params.messageId, 'messageId');
  const destinationConversationId = assertObjectId(req.body.destinationConversationId, 'destinationConversationId');
  const currentActor = actor(req);
  const data = await converseService.forwardMessage(
    currentActor.userId,
    currentActor.displayName || currentActor.name || '',
    conversationId,
    messageId,
    destinationConversationId,
    req.v2Auth
  );
  return sendSuccess(res, data, { status: 201 });
}

module.exports = {
  listConversations: asyncHandler(listConversations),
  createDirect: asyncHandler(createDirect),
  createProjectRoom: asyncHandler(createProjectRoom),
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
  toggleReaction: asyncHandler(toggleReaction),
  getUnreadCount: asyncHandler(getUnreadCount),
  searchUsers: asyncHandler(searchUsers),
  listTeamMembers: asyncHandler(listTeamMembers),
  getOnlineUsers: asyncHandler(getOnlineUsers),
  getConfig: asyncHandler(getConfig),
  downloadAttachment: asyncHandler(downloadAttachment),
  search: asyncHandler(search),
  saveMessage: asyncHandler(saveMessage),
  unsaveMessage: asyncHandler(unsaveMessage),
  pinMessage: asyncHandler(pinMessage),
  unpinMessage: asyncHandler(unpinMessage),
  setNotificationPreference: asyncHandler(setNotificationPreference),
  forwardMessage: asyncHandler(forwardMessage),
};
