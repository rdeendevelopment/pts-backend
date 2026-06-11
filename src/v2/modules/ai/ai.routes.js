const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { asyncHandler } = require('../../kernel/middleware');
const authenticate = require('../auth/middleware/authenticate');
const requireAiAdminAccess = require('./middleware/requireAiAdminAccess');
const controller = require('./controllers/ai.controller');
const { runAiRules, jobIdParamRules } = require('./validators/ai.validators');

const router = Router();

router.use(authenticate);
router.use(requireAiAdminAccess);

router.get('/actions', asyncHandler(controller.listActions));
router.post('/run', runAiRules, validateRequest, asyncHandler(controller.runAi));
router.get('/jobs/:jobId', jobIdParamRules, validateRequest, asyncHandler(controller.getJob));

module.exports = router;
