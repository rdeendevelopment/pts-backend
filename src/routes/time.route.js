const express = require('express');
const router = express.Router();

const timeController = require('../app/Controllers/time.controller');
const { authenticate, requireAnyPermission, requirePermission } = require('../app/Middleware/auth');

router.use(authenticate);

router.get('/activity-categories', requireAnyPermission(['time.create', 'time.approve', 'time.view_all']), timeController.getActivityCategories);

router.get('/weeks', requirePermission('time.view_own'), timeController.getUserWeeks);
router.get('/project/:projectId/summary', requirePermission('time.view_own'), timeController.getProjectTimeSummary);
router.get('/project/:projectId/week', requirePermission('time.view_own'), timeController.getProjectWeekEntries);
router.get('/week', requirePermission('time.view_own'), timeController.getWeek);
router.post('/entry', requirePermission('time.create'), timeController.createEntry);
router.put('/entry/:id', requirePermission('time.update_own'), timeController.updateEntry);
router.delete('/entry/:id', requirePermission('time.update_own'), timeController.deleteEntry);
router.post('/week/submit', requirePermission('time.submit'), timeController.submitWeek);
router.post('/week/unsubmit', requirePermission('time.submit'), timeController.unsubmitWeek);

router.get('/timer/active', requirePermission('time.view_own'), timeController.getActiveTimer);
router.post('/timer/start', requirePermission('time.create'), timeController.startTimer);
router.post('/timer/stop', requirePermission('time.create'), timeController.stopTimer);

router.get('/team', requireAnyPermission(['time.view_team', 'time.view_all']), timeController.getTeam);
router.post('/week/:id/approve', requireAnyPermission(['time.approve', 'time.view_all']), timeController.approveWeek);
router.post('/week/:id/reject', requireAnyPermission(['time.reject', 'time.view_all']), timeController.rejectWeek);

// Admin: manage any user's weeks
router.get('/admin/weeks', requireAnyPermission(['time.approve', 'time.view_all']), timeController.getAdminWeeks);
router.get('/admin/week', requireAnyPermission(['time.approve', 'time.view_all']), timeController.getAdminWeek);
router.post('/admin/notify-missing-week', requireAnyPermission(['time.approve', 'time.view_all']), timeController.notifyMissingWeek);

// Admin-only: orphaned timer visibility and force-stop
router.get('/admin/orphaned-timers', requirePermission('time.view_all'), timeController.getOrphanedTimers);
router.post('/admin/timer/:id/force-stop', requirePermission('time.view_all'), timeController.adminForceStopTimer);

module.exports = router;
