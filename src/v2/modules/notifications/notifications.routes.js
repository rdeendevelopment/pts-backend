const { Router } = require('express');
const { query, param } = require('express-validator');
const authenticate = require('../auth/middleware/authenticate');
const { validateRequest } = require('../../kernel/validators');
const controller = require('./controllers/notification.controller');

const router = Router();

const listQueryRules = [
  query('unread').optional().isIn(['true', 'false', '1', '0']),
  query('isRead').optional().isIn(['true', 'false']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

const idRules = [
  param('id').isString().notEmpty().withMessage('notification id is required'),
];

router.use(authenticate);

router.get('/unread-count', listQueryRules, validateRequest, controller.getUnreadCount);
router.post('/read-all', controller.markAllRead);
router.get('/', listQueryRules, validateRequest, controller.listNotifications);
router.patch('/:id/read', idRules, validateRequest, controller.markRead);

module.exports = router;
