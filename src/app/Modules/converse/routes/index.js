const express = require('express');
const router = express.Router();

router.use('/conversations', require('./conversation.routes'));
router.use('/groups', require('./group.routes'));
router.use('/messages', require('./message.routes'));
router.use('/users', require('./user.routes'));
router.use('/attachments', require('./attachment.routes'));
router.use('/presence', require('./presence.routes'));
router.use('/config', require('./config.routes'));

module.exports = router;
