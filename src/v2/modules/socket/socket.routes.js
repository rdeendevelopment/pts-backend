const { Router } = require('express');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const controller = require('./controllers/socket.controller');

const router = Router();

router.use(authenticate);

router.get('/health', controller.getHealth);
router.get(
  '/presence',
  authorize(['rbac.manage', 'modules.manage'], { mode: 'any' }),
  controller.getPresence
);

module.exports = router;
