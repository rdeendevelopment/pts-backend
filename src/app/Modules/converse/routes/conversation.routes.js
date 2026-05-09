const express = require('express');
const router = express.Router();

const { authenticate } = require('../../../Middleware/auth');
const converseEnabled = require('../middlewares/converseEnabled.middleware');
const conversationAccess = require('../middlewares/conversationAccess.middleware');
const controller = require('../controllers/conversation.controller');
const { createDirect, createGroup, muteBody, conversationIdOnly } = require('../validators/conversation.validator');

router.use(authenticate, converseEnabled);

router.get('/', controller.list);
router.post('/direct', createDirect, controller.createDirect);
router.post('/group', createGroup, controller.createGroup);
router.get('/:conversationId', conversationAccess, controller.getDetail);
router.patch('/:conversationId/pin', conversationAccess, controller.pin);
router.patch('/:conversationId/mute', conversationAccess, muteBody, controller.mute);
router.delete('/:conversationId/delete-for-me', conversationAccess, controller.deleteForMe);
router.post('/:conversationId/leave', conversationAccess, controller.leave);

module.exports = router;
