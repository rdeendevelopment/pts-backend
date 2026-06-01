const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { assertObjectId } = require('../../kernel/validators/objectId');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const attachReportsUser = require('./middleware/attachReportsUser');
const userTimeReportController = require('./controllers/userTimeReport.controller');
const teamTimeReportController = require('./controllers/teamTimeReport.controller');
const projectTimeReportController = require('./controllers/projectTimeReport.controller');
const clientTimeReportController = require('./controllers/clientTimeReport.controller');
const weekApprovalReportController = require('./controllers/weekApprovalReport.controller');
const {
  timeReportQueryRules,
  weekApprovalQueryRules,
} = require('./validators/reports.validators');

const router = Router();

const canViewReports = authorize(['activity.view', 'reports.view', 'reports.manage', 'activity.manage'], {
  mode: 'any',
});

router.use(authenticate);
router.use(attachReportsUser);

router.get(
  '/users/:userId/time',
  canViewReports,
  (req, res, next) => {
    try {
      assertObjectId(req.params.userId, 'userId');
      next();
    } catch (err) {
      next(err);
    }
  },
  timeReportQueryRules,
  validateRequest,
  userTimeReportController.getUserTimeReport
);

router.get(
  '/team/time',
  canViewReports,
  timeReportQueryRules,
  validateRequest,
  teamTimeReportController.getTeamTimeReport
);

router.get(
  '/projects/:projectId/time',
  canViewReports,
  (req, res, next) => {
    try {
      assertObjectId(req.params.projectId, 'projectId');
      next();
    } catch (err) {
      next(err);
    }
  },
  timeReportQueryRules,
  validateRequest,
  projectTimeReportController.getProjectTimeReport
);

router.get(
  '/clients/:clientId/time',
  canViewReports,
  (req, res, next) => {
    try {
      assertObjectId(req.params.clientId, 'clientId');
      next();
    } catch (err) {
      next(err);
    }
  },
  timeReportQueryRules,
  validateRequest,
  clientTimeReportController.getClientTimeReport
);

router.get(
  '/approvals/weeks',
  canViewReports,
  weekApprovalQueryRules,
  validateRequest,
  weekApprovalReportController.getWeekApprovalReport
);

module.exports = router;
