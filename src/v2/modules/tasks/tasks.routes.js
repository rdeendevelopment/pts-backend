const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { assertObjectId } = require('../../kernel/validators/objectId');
const { asyncHandler } = require('../../kernel/middleware');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const controller = require('./controllers/task.controller');
const taskAccessService = require('./services/taskAccess.service');
const {
  projectIdRules,
  taskIdRules,
  createTaskRules,
  updateTaskRules,
  moveTaskRules,
  createCommentRules,
  aggregateQueryRules,
  notificationQueryRules,
  reportsQueryRules,
  teamDashboardQueryRules,
  teamTasksQueryRules,
  notificationIdRules,
  attachmentIdRules,
  statusIdRules,
  updateProjectSettingsRules,
  createWorkflowStatusRules,
  updateWorkflowStatusRules,
  reorderWorkflowStatusesRules,
  archiveWorkflowStatusRules,
  memberIdRules,
  addProjectMemberRules,
  updateProjectMemberRules,
  addCollaboratorRules,
  collaboratorUserIdRules,
} = require('./validators/task.validators');

const router = Router();

const canViewTasks = authorize(['tasks.view', 'tasks.manage'], { mode: 'any' });
/** Platform task admins: workflow, members, reports, permanent delete */
const canManageTasks = authorize('tasks.manage');
/** Day-to-day task work on assigned projects (guarded by taskAccess + mutation helpers) */
const canWorkOnTasks = canViewTasks;

router.use(authenticate);

function assertProjectId(req, res, next) {
  try {
    assertObjectId(req.params.projectId, 'projectId');
    next();
  } catch (err) {
    next(err);
  }
}

const assertProjectTaskAccess = asyncHandler(async (req, res, next) => {
  await taskAccessService.assertCanAccessProjectForTasks(req, req.params.projectId);
  next();
});

function assertTaskId(req, res, next) {
  try {
    assertObjectId(req.params.taskId, 'taskId');
    next();
  } catch (err) {
    next(err);
  }
}

router.get('/projects/:projectId/board', canViewTasks, projectIdRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.getBoard);
router.get('/projects/:projectId/workflow', canViewTasks, projectIdRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.getWorkflow);
router.get('/projects/:projectId/settings', canViewTasks, projectIdRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.getProjectSettings);
router.patch('/projects/:projectId/settings', canManageTasks, updateProjectSettingsRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.updateProjectSettings);
router.patch('/projects/:projectId/workflow/statuses/reorder', canManageTasks, reorderWorkflowStatusesRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.reorderWorkflowStatuses);
router.post('/projects/:projectId/workflow/statuses', canManageTasks, createWorkflowStatusRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.addWorkflowStatus);
router.patch('/projects/:projectId/workflow/statuses/:statusId', canManageTasks, updateWorkflowStatusRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.updateWorkflowStatus);
router.post('/projects/:projectId/workflow/statuses/:statusId/archive', canManageTasks, archiveWorkflowStatusRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.archiveWorkflowStatus);
router.get('/projects/:projectId/members', canViewTasks, projectIdRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.listMembers);
router.post('/projects/:projectId/members', canManageTasks, addProjectMemberRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.addProjectMember);
router.patch('/projects/:projectId/members/:memberId', canManageTasks, updateProjectMemberRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.updateProjectMember);
router.delete(
  '/projects/:projectId/members/:memberId',
  canManageTasks,
  [...projectIdRules, ...memberIdRules],
  validateRequest,
  assertProjectId,
  assertProjectTaskAccess,
  controller.removeProjectMember
);
router.get('/projects/:projectId/tasks/archived', canViewTasks, projectIdRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.listArchivedTasks);
router.post('/projects/:projectId/tasks', canWorkOnTasks, createTaskRules, validateRequest, assertProjectId, assertProjectTaskAccess, controller.createTask);

router.get('/inbox', canViewTasks, aggregateQueryRules, validateRequest, controller.getInbox);
router.get('/my-tasks', canViewTasks, aggregateQueryRules, validateRequest, controller.getMyTasks);

router.get('/notifications/unread-count', canViewTasks, notificationQueryRules, validateRequest, controller.getNotificationUnreadCount);
router.post('/notifications/read-all', canViewTasks, controller.markAllNotificationsRead);
router.get('/notifications', canViewTasks, notificationQueryRules, validateRequest, controller.listNotifications);
router.patch('/notifications/:id/read', canViewTasks, notificationIdRules, validateRequest, controller.markNotificationRead);
router.get('/mentions', canViewTasks, notificationQueryRules, validateRequest, controller.getMentions);

router.get('/activity', canViewTasks, controller.getActivity);
router.get('/activity/summary', canManageTasks, controller.getActivitySummary);
router.get('/calendar', canViewTasks, controller.getCalendar);
router.get('/reports/workload', canManageTasks, controller.getWorkload);
router.get('/reports/project-health', canManageTasks, controller.getProjectHealth);
router.get('/reports', canViewTasks, reportsQueryRules, validateRequest, controller.getReports);

router.get('/team/dashboard', canViewTasks, teamDashboardQueryRules, validateRequest, controller.getTeamDashboard);
router.get('/team/tasks', canViewTasks, teamTasksQueryRules, validateRequest, controller.listTeamTasks);
router.get('/team/users/:userId', canViewTasks, teamDashboardQueryRules, validateRequest, controller.getTeamUserDashboard);

router.get('/tasks/:taskId', canViewTasks, taskIdRules, validateRequest, assertTaskId, controller.getTask);
router.patch('/tasks/:taskId', canWorkOnTasks, updateTaskRules, validateRequest, assertTaskId, controller.updateTask);
router.patch('/tasks/:taskId/move', canViewTasks, moveTaskRules, validateRequest, assertTaskId, controller.moveTask);
router.post('/tasks/:taskId/complete', canWorkOnTasks, taskIdRules, validateRequest, assertTaskId, controller.completeTask);
router.post('/tasks/:taskId/archive', canWorkOnTasks, taskIdRules, validateRequest, assertTaskId, controller.archiveTask);
router.post('/tasks/:taskId/restore', canWorkOnTasks, taskIdRules, validateRequest, assertTaskId, controller.restoreTask);
router.delete('/tasks/:taskId/permanent', canManageTasks, taskIdRules, validateRequest, assertTaskId, controller.permanentDeleteTask);

router.get('/tasks/:taskId/collaborators', canViewTasks, taskIdRules, validateRequest, assertTaskId, controller.listCollaborators);
router.post('/tasks/:taskId/collaborators', canViewTasks, addCollaboratorRules, validateRequest, assertTaskId, controller.addCollaborator);
router.delete(
  '/tasks/:taskId/collaborators/:userId',
  canViewTasks,
  [...taskIdRules, ...collaboratorUserIdRules],
  validateRequest,
  assertTaskId,
  controller.removeCollaborator
);

router.get('/tasks/:taskId/comments', canViewTasks, taskIdRules, validateRequest, assertTaskId, controller.listComments);
router.post('/tasks/:taskId/comments', canViewTasks, createCommentRules, validateRequest, assertTaskId, controller.createComment);
router.post('/tasks/:taskId/comment-attachments', canViewTasks, taskIdRules, validateRequest, assertTaskId, controller.uploadCommentAttachment);
router.post('/tasks/:taskId/attachments', canWorkOnTasks, taskIdRules, validateRequest, assertTaskId, controller.uploadTaskAttachment);
router.delete(
  '/tasks/:taskId/attachments/:attachmentId',
  canWorkOnTasks,
  [...taskIdRules, ...attachmentIdRules],
  validateRequest,
  assertTaskId,
  controller.deleteTaskAttachment
);

module.exports = router;
