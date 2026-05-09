const express = require('express');
const router = express.Router();

const { authenticate } = require('../../../Middleware/auth');
const converseEnabled = require('../middlewares/converseEnabled.middleware');
const conversationAccess = require('../middlewares/conversationAccess.middleware');
const groupAdmin = require('../middlewares/groupAdmin.middleware');
const controller = require('../controllers/group.controller');
const { rename, addMembers, removeMember } = require('../validators/group.validator');

router.use(authenticate, converseEnabled);

router.patch('/:conversationId/rename', conversationAccess, groupAdmin, rename, controller.rename);
router.post('/:conversationId/members', conversationAccess, groupAdmin, addMembers, controller.addMembers);
router.delete('/:conversationId/members/:userId', conversationAccess, groupAdmin, removeMember, controller.removeMember);

module.exports = router;
