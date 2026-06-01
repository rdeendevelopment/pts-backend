const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const controller = require('./controllers/auth.controller');
const authenticate = require('./middleware/authenticate');
const {
  registerRules,
  loginRules,
  refreshRules,
  logoutRules,
} = require('./validators/auth.validators');

const router = Router();

router.post('/register', registerRules, validateRequest, controller.register);
router.post('/login', loginRules, validateRequest, controller.login);
router.post('/refresh', refreshRules, validateRequest, controller.refresh);
router.post('/logout', logoutRules, validateRequest, controller.logout);
router.get('/me', authenticate, controller.me);

module.exports = router;
