const express = require('express');
const router = express.Router();

const taskTimeController = require('../app/Controllers/task-time.controller');
const { authenticate, requirePermission } = require('../app/Middleware/auth');

router.use(authenticate);

router.get('/time-summary', requirePermission('tasks.view'), taskTimeController.getTaskTimeSummary);

module.exports = router;
