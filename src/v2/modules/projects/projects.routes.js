const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { assertObjectId } = require('../../kernel/validators/objectId');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const requireSuperAdmin = require('../rbac/middleware/requireSuperAdmin');
const projectController = require('./controllers/project.controller');
const budgetController = require('./controllers/projectBudget.controller');
const assignmentController = require('./controllers/projectAssignment.controller');
const fileController = require('./controllers/projectFile.controller');
const statsController = require('./controllers/projectStats.controller');
const eventController = require('./controllers/projectEvent.controller');
const {
  listRules,
  idParamRules,
  projectIdParamRules,
  createRules,
  updateRules,
  statusRules,
  permanentDeleteRules,
  budgetCreateRules,
  budgetUpdateRules,
  budgetStatusRules,
  retainerBudgetEnsureRules,
  assignmentCreateRules,
  assignmentUpdateRules,
  fileCreateRules,
  fileIdParamRules,
  budgetIdParamRules,
  assignmentIdParamRules,
} = require('./validators/project.validators');

const router = Router();

const canViewProjects = authorize(['projects.view', 'projects.manage'], { mode: 'any' });
const canManageProjects = authorize('projects.manage');
const canViewBudgets = authorize(['budgets.view', 'budgets.manage'], { mode: 'any' });
const canManageBudgets = authorize('budgets.manage');
const canViewAssignments = authorize(['assignments.view', 'assignments.manage'], { mode: 'any' });
const canManageAssignments = authorize('assignments.manage');

function assertProjectId(req, res, next) {
  try {
    assertObjectId(req.params.projectId, 'projectId');
    next();
  } catch (err) {
    next(err);
  }
}

function assertProjectRouteId(req, res, next) {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}

router.use(authenticate);

router.get('/', canViewProjects, listRules, validateRequest, projectController.listProjects);
router.get('/:id', canViewProjects, idParamRules, validateRequest, assertProjectRouteId, projectController.getProjectById);
router.post('/', canManageProjects, createRules, validateRequest, projectController.createProject);
router.patch('/:id/status', canManageProjects, statusRules, validateRequest, assertProjectRouteId, projectController.updateProjectStatus);
router.patch('/:id', canManageProjects, updateRules, validateRequest, assertProjectRouteId, projectController.updateProject);
router.delete('/:id', canManageProjects, idParamRules, validateRequest, assertProjectRouteId, projectController.deleteProject);
router.post(
  '/:id/permanent-delete',
  requireSuperAdmin,
  permanentDeleteRules,
  validateRequest,
  assertProjectRouteId,
  projectController.permanentDeleteProject,
);

router.get('/:projectId/budgets', canViewBudgets, projectIdParamRules, validateRequest, assertProjectId, budgetController.listBudgets);
router.post('/:projectId/budgets/retainer/current', canManageBudgets, retainerBudgetEnsureRules, validateRequest, assertProjectId, budgetController.ensureCurrentRetainerBudget);
router.post('/:projectId/budgets/retainer/next', canManageBudgets, retainerBudgetEnsureRules, validateRequest, assertProjectId, budgetController.ensureNextRetainerBudget);
router.post('/:projectId/budgets', canManageBudgets, budgetCreateRules, validateRequest, assertProjectId, budgetController.createBudget);
router.patch('/:projectId/budgets/:budgetId/status', canManageBudgets, budgetStatusRules, validateRequest, assertProjectId, (req, res, next) => {
  try {
    assertObjectId(req.params.budgetId, 'budgetId');
    next();
  } catch (err) {
    next(err);
  }
}, budgetController.updateBudgetStatus);
router.patch('/:projectId/budgets/:budgetId', canManageBudgets, budgetUpdateRules, validateRequest, assertProjectId, (req, res, next) => {
  try {
    assertObjectId(req.params.budgetId, 'budgetId');
    next();
  } catch (err) {
    next(err);
  }
}, budgetController.updateBudget);
router.delete('/:projectId/budgets/:budgetId', canManageBudgets, budgetIdParamRules, validateRequest, assertProjectId, (req, res, next) => {
  try {
    assertObjectId(req.params.budgetId, 'budgetId');
    next();
  } catch (err) {
    next(err);
  }
}, budgetController.deleteBudget);

router.get('/:projectId/assignments', canViewAssignments, projectIdParamRules, validateRequest, assertProjectId, assignmentController.listAssignments);
router.post('/:projectId/assignments', canManageAssignments, assignmentCreateRules, validateRequest, assertProjectId, assignmentController.createAssignment);
router.patch('/:projectId/assignments/:assignmentId', canManageAssignments, assignmentUpdateRules, validateRequest, assertProjectId, (req, res, next) => {
  try {
    assertObjectId(req.params.assignmentId, 'assignmentId');
    next();
  } catch (err) {
    next(err);
  }
}, assignmentController.updateAssignment);
router.delete('/:projectId/assignments/:assignmentId', canManageAssignments, assignmentIdParamRules, validateRequest, assertProjectId, (req, res, next) => {
  try {
    assertObjectId(req.params.assignmentId, 'assignmentId');
    next();
  } catch (err) {
    next(err);
  }
}, assignmentController.removeAssignment);

router.get('/:projectId/files', canViewProjects, projectIdParamRules, validateRequest, assertProjectId, fileController.listFiles);
router.post('/:projectId/files/upload', canManageProjects, projectIdParamRules, validateRequest, assertProjectId, fileController.uploadFiles);
router.post('/:projectId/files', canManageProjects, fileCreateRules, validateRequest, assertProjectId, fileController.createFile);
router.delete('/:projectId/files/:fileId', canManageProjects, fileIdParamRules, validateRequest, assertProjectId, (req, res, next) => {
  try {
    assertObjectId(req.params.fileId, 'fileId');
    next();
  } catch (err) {
    next(err);
  }
}, fileController.deleteFile);

router.get('/:projectId/stats', canViewProjects, projectIdParamRules, validateRequest, assertProjectId, statsController.getProjectStats);
router.get('/:projectId/events', canViewProjects, projectIdParamRules, validateRequest, assertProjectId, eventController.listProjectEvents);

module.exports = router;
