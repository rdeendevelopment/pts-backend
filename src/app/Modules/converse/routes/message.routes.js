const express = require('express');
const router = express.Router();

const { authenticate } = require('../../../Middleware/auth');
const converseEnabled = require('../middlewares/converseEnabled.middleware');
const conversationAccess = require('../middlewares/conversationAccess.middleware');
const controller = require('../controllers/message.controller');
const {
  listMessages,
  sendMessage,
  editMessage,
  messageIdParam,
  forward,
} = require('../validators/message.validator');

router.use(authenticate, converseEnabled);

// conversationId in param — use conversationAccess middleware
router.get('/:conversationId', conversationAccess, listMessages, controller.list);

// conversationId in body — membership verified inside service
router.post('/', sendMessage, controller.send);

// messageId-only routes — membership verified inside service per message's conversation
router.patch('/:messageId', editMessage, controller.edit);
router.delete('/:messageId/everyone', messageIdParam, controller.deleteForEveryone);
router.post('/:messageId/read', messageIdParam, controller.markRead);
router.post('/:messageId/pin', messageIdParam, controller.pin);
router.delete('/:messageId/pin', messageIdParam, controller.unpin);
router.post('/:messageId/forward', forward, controller.forward);

module.exports = router;
