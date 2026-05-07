const express = require('express');
const router = express.Router();

const projectDashboardController = require('../app/Controllers/project-dashboard.controller');
const { authenticate, requirePermission } = require('../app/Middleware/auth');

router.use(authenticate);

router.get('/:id/dashboard', requirePermission('projects.view'), projectDashboardController.getProjectDashboard);
router.get('/:id/time-entries', requirePermission('projects.view'), projectDashboardController.getProjectTimeEntries);

module.exports = router;
