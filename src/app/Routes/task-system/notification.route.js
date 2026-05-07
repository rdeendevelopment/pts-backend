const express = require('express');
const router = express.Router();
const userAuth = require('../../Middleware/user_auth');
const controller = require('../../Controllers/task-system/notification.controller');

router.use(userAuth);

router.get('/', controller.getNotifications);
router.get('/unread-count', controller.getUnreadCount);
router.put('/read-all', controller.markAllAsRead);
router.put('/:id/read', controller.markAsRead);

module.exports = router;
