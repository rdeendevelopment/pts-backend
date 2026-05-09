const express = require('express');
const router = express.Router();
const { authenticate } = require('../../../Middleware/auth');
const converseEnabled = require('../middlewares/converseEnabled.middleware');
const { getPresenceStatuses, getOnlineUserIds } = require('../controllers/presence.controller');

// Both endpoints require auth + converse module enabled.
router.get('/online', authenticate, converseEnabled, getOnlineUserIds);
router.get('/', authenticate, converseEnabled, getPresenceStatuses);

module.exports = router;
