const { Router } = require('express');
const { query, param } = require('express-validator');
const authenticate = require('../auth/middleware/authenticate');
const { validateRequest } = require('../../kernel/validators');
const controller = require('./controllers/notification.controller');
const requireNotificationSettingsAdmin = require('./middleware/requireNotificationSettingsAdmin');

const router = Router();

const listQueryRules = [
  query('unread').optional().isIn(['true', 'false', '1', '0']),
  query('isRead').optional().isIn(['true', 'false']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('readState').optional().isIn(['all', 'read', 'unread']),
  query('category').optional().isString().isLength({ max: 40 }),
  query('module').optional().isIn(['task', 'tasks', 'timesheets', 'projects', 'activity', 'converse']),
  query('projectId').optional().isMongoId(),
  query('search').optional().isString().isLength({ max: 120 }),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
];

const idRules = [
  param('id').isString().notEmpty().withMessage('notification id is required'),
];

router.use(authenticate);
router.get('/settings', requireNotificationSettingsAdmin, controller.getSettings);
router.patch('/settings', requireNotificationSettingsAdmin, controller.updateSettings);

router.get('/unread-count', listQueryRules, validateRequest, controller.getUnreadCount);
router.post('/read-all', controller.markAllRead);
router.get('/', listQueryRules, validateRequest, controller.listNotifications);
router.patch('/:id/read', idRules, validateRequest, controller.markRead);
router.patch('/:id/unread', idRules, validateRequest, controller.markUnread);

module.exports = router;
