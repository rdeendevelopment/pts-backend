const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const requireSystemModule = require('../modules/middleware/requireSystemModule');
const attachConverseUser = require('./middleware/attachConverseUser');
const controller = require('./controllers/converse.controller');
const {
  conversationIdRules,
  messageIdRules,
  createDirectRules,
  createGroupRules,
  sendMessageRules,
  participantsRules,
  searchRules,
} = require('./validators/converse.validators');

const router = Router();
const canView = authorize('converse.view');
const canManage = authorize('converse.manage');

router.use(authenticate, requireSystemModule('converse'), attachConverseUser, canView);

router.get('/unread-count', controller.getUnreadCount);
router.get('/users/search', searchRules, validateRequest, controller.searchUsers);
router.get('/presence/online', controller.getOnlineUsers);
router.get('/config', controller.getConfig);

router.get('/conversations', controller.listConversations);
router.post('/conversations/direct', createDirectRules, validateRequest, canManage, controller.createDirect);
router.post('/conversations/group', createGroupRules, validateRequest, canManage, controller.createGroup);
router.get('/conversations/:conversationId', conversationIdRules, validateRequest, controller.getConversation);
router.patch('/conversations/:conversationId', conversationIdRules, validateRequest, controller.updateConversation);
router.post('/conversations/:conversationId/leave', conversationIdRules, validateRequest, controller.leaveConversation);
router.post('/conversations/:conversationId/read', conversationIdRules, validateRequest, controller.markRead);
router.post('/conversations/:conversationId/participants', participantsRules, validateRequest, canManage, controller.addParticipants);
router.delete('/conversations/:conversationId/participants/:userId', conversationIdRules, validateRequest, canManage, controller.removeParticipant);

router.get('/conversations/:conversationId/messages', conversationIdRules, validateRequest, controller.listMessages);
router.post('/conversations/:conversationId/messages', sendMessageRules, validateRequest, canManage, controller.sendMessage);
router.patch('/conversations/:conversationId/messages/:messageId', messageIdRules, validateRequest, canManage, controller.editMessage);
router.delete('/conversations/:conversationId/messages/:messageId', messageIdRules, validateRequest, canManage, controller.deleteMessage);

module.exports = router;
