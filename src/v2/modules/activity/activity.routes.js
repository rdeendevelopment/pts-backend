const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { assertObjectId } = require('../../kernel/validators/objectId');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const attachActivityUser = require('./middleware/attachActivityUser');
const weekController = require('./controllers/timeWeek.controller');
const entryController = require('./controllers/timeEntry.controller');
const timerController = require('./controllers/timer.controller');
const categoryController = require('./controllers/workCategory.controller');
const projectActivityController = require('./controllers/projectActivity.controller');
const activityAdminController = require('./controllers/activityAdmin.controller');
const {
  weekListRules,
  weekIdRules,
  weekCreateRules,
  weekRejectRules,
  entryListRules,
  entryIdRules,
  entryCreateRules,
  entryUpdateRules,
  validatePreviewRules,
  timerStartRules,
  timerIdRules,
  timerCorrectionRules,
  projectIdParamRules,
  projectSummaryRules,
  projectWeeklyRules,
  projectTimeEntriesRules,
  workforceSummaryRules,
  notifyMissingWeekRules,
} = require('./validators/activity.validators');

const router = Router();

const canViewActivity = authorize(['activity.view', 'activity.manage'], { mode: 'any' });
const canViewAllActivity = authorize(['activity.view_all', 'activity.manage'], { mode: 'any' });
const canManageActivity = authorize('activity.manage');

router.use(authenticate);
router.use(attachActivityUser);

router.get('/weeks', canViewActivity, weekListRules, validateRequest, weekController.listWeeks);
router.get('/weeks/:id', canViewActivity, weekIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, weekController.getWeekById);
router.post('/weeks', canViewActivity, weekCreateRules, validateRequest, weekController.createWeek);
router.post('/weeks/:id/submit', canViewActivity, weekIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, weekController.submitWeek);
router.post('/weeks/:id/approve', canManageActivity, weekIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, weekController.approveWeek);
router.post('/weeks/:id/reject', canManageActivity, weekRejectRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, weekController.rejectWeek);

router.get('/time-entries', canViewActivity, entryListRules, validateRequest, entryController.listEntries);
router.get('/time-entries/:id', canViewActivity, entryIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, entryController.getEntryById);
router.post('/time-entries', canViewActivity, entryCreateRules, validateRequest, entryController.createEntry);
router.patch('/time-entries/:id', canViewActivity, entryUpdateRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, entryController.updateEntry);
router.delete('/time-entries/:id', canViewActivity, entryIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, entryController.deleteEntry);

router.post('/validate-time-entry', canViewActivity, validatePreviewRules, validateRequest, entryController.validateTimeEntry);

router.post('/timers/start', canViewActivity, timerStartRules, validateRequest, timerController.startTimer);
router.post('/timers/:id/stop', canViewActivity, timerIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, timerController.stopTimer);
router.post('/timers/:id/correct', canViewActivity, timerCorrectionRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, timerController.correctTimer);
router.post('/timers/:id/pause', canViewActivity, timerIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, timerController.pauseTimer);
router.post('/timers/:id/heartbeat', canViewActivity, timerIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, timerController.heartbeatTimer);
router.post('/timers/:id/resume', canViewActivity, timerIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, timerController.resumeTimer);
router.post('/timers/:id/discard', canViewActivity, timerIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, timerController.discardTimer);
router.post('/timers/:id/cancel', canViewActivity, timerIdRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, timerController.cancelTimer);
router.get('/timers/active/me', canViewActivity, timerController.getActiveTimer);
router.get('/timers/paused/me', canViewActivity, timerController.listPausedTimers);

router.get('/work-categories', canViewActivity, categoryController.listWorkCategories);

router.get(
  '/projects/:projectId/summary',
  canViewActivity,
  projectSummaryRules,
  validateRequest,
  (req, res, next) => {
    try {
      assertObjectId(req.params.projectId, 'projectId');
      next();
    } catch (err) {
      next(err);
    }
  },
  projectActivityController.getProjectSummary
);

router.get(
  '/projects/:projectId/weeks',
  canViewActivity,
  projectWeeklyRules,
  validateRequest,
  (req, res, next) => {
    try {
      assertObjectId(req.params.projectId, 'projectId');
      next();
    } catch (err) {
      next(err);
    }
  },
  projectActivityController.getProjectWeeklyActivity
);

router.get(
  '/projects/:projectId/time-entries',
  canViewActivity,
  projectTimeEntriesRules,
  validateRequest,
  (req, res, next) => {
    try {
      assertObjectId(req.params.projectId, 'projectId');
      next();
    } catch (err) {
      next(err);
    }
  },
  projectActivityController.listProjectTimeEntries
);

router.get(
  '/projects/:projectId/budgets',
  canViewActivity,
  projectIdParamRules,
  validateRequest,
  (req, res, next) => {
    try {
      assertObjectId(req.params.projectId, 'projectId');
      next();
    } catch (err) {
      next(err);
    }
  },
  projectActivityController.listProjectBudgets
);

router.get(
  '/admin/workforce-summary',
  canViewAllActivity,
  workforceSummaryRules,
  validateRequest,
  activityAdminController.getWorkforceSummary
);

router.post(
  '/admin/notify-missing-week',
  canManageActivity,
  notifyMissingWeekRules,
  validateRequest,
  activityAdminController.notifyMissingWeek
);

module.exports = router;
