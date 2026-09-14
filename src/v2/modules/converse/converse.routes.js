const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const requireSystemModule = require('../modules/middleware/requireSystemModule');
const attachConverseUser = require('./middleware/attachConverseUser');
const controller = require('./controllers/converse.controller');
const { asyncHandler } = require('../../kernel/middleware');
const { AppError } = require('../../kernel/errors');
const { saveUploadedFiles } = require('../../kernel/helpers/localFileUpload.helper');
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

router.use(authenticate, requireSystemModule('converse'), attachConverseUser, canView);

router.get('/unread-count', controller.getUnreadCount);
router.get('/users', controller.listTeamMembers);
router.get('/users/search', searchRules, validateRequest, controller.searchUsers);
router.get('/presence/online', controller.getOnlineUsers);
router.get('/config', controller.getConfig);
router.post('/uploads', asyncHandler(async (req, res) => {
  try {
    const savedFiles = await saveUploadedFiles(req.files, {
      maxFiles: 10,
      maxSizeBytes: 200 * 1024 * 1024,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx', 'txt', 'xlsx', 'mp4', 'webm', 'ogv', 'mov'],
    });
    return res.status(200).json({ success: true, savedFiles });
  } catch (error) {
    if (error.status === 400) throw new AppError(error.message, { status: 400 });
    throw error;
  }
}));

router.get('/conversations', controller.listConversations);
router.post('/conversations/direct', createDirectRules, validateRequest, controller.createDirect);
router.post('/conversations/group', createGroupRules, validateRequest, controller.createGroup);
router.post('/conversations/project', controller.createProjectRoom);
router.get('/conversations/:conversationId', conversationIdRules, validateRequest, controller.getConversation);
router.patch('/conversations/:conversationId', conversationIdRules, validateRequest, controller.updateConversation);
router.post('/conversations/:conversationId/leave', conversationIdRules, validateRequest, controller.leaveConversation);
router.post('/conversations/:conversationId/read', conversationIdRules, validateRequest, controller.markRead);
router.post('/conversations/:conversationId/participants', participantsRules, validateRequest, controller.addParticipants);
router.delete('/conversations/:conversationId/participants/:userId', conversationIdRules, validateRequest, controller.removeParticipant);

router.get('/conversations/:conversationId/messages', conversationIdRules, validateRequest, controller.listMessages);
router.post('/conversations/:conversationId/messages', sendMessageRules, validateRequest, controller.sendMessage);
router.patch('/conversations/:conversationId/messages/:messageId', messageIdRules, validateRequest, controller.editMessage);
router.delete('/conversations/:conversationId/messages/:messageId', messageIdRules, validateRequest, controller.deleteMessage);
router.post('/conversations/:conversationId/messages/:messageId/reactions', messageIdRules, validateRequest, controller.toggleReaction);

module.exports = router;
