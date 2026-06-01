const { Router } = require('express');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const controller = require('./controllers/announcement.controller');

const router = Router();
const canManage = authorize(['users.manage', 'modules.manage'], { mode: 'any' });

router.use(authenticate);

router.get('/active', controller.listActive);
router.post('/:id/read', controller.markRead);
router.post('/:id/dismiss', controller.dismiss);

router.get('/', canManage, controller.listAdmin);
router.post('/', canManage, controller.create);
router.patch('/:id/enabled', canManage, controller.setEnabled);
router.patch('/:id', canManage, controller.update);
router.delete('/:id', canManage, controller.archive);

module.exports = router;
