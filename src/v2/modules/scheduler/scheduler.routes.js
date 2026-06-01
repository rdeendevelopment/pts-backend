const { Router } = require('express');
const { query, param } = require('express-validator');
const { validateRequest } = require('../../kernel/validators');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const schedulerController = require('./controllers/scheduler.controller');

const router = Router();

const canManageScheduler = authorize('projects.manage');

router.use(authenticate);

router.get('/jobs', canManageScheduler, schedulerController.listJobs);
router.get('/runs', canManageScheduler, [
  query('job_name').optional().isString(),
  query('jobName').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
], validateRequest, schedulerController.listRuns);
router.get('/runs/:runId', canManageScheduler, [
  param('runId').isString().notEmpty(),
], validateRequest, schedulerController.getRun);
router.post('/jobs/retainer-renewal/run', canManageScheduler, schedulerController.triggerRetainerRenewal);

module.exports = router;
