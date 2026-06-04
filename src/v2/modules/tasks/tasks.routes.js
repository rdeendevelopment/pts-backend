const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { assertObjectId } = require('../../kernel/validators/objectId');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const controller = require('./controllers/task.controller');
const {
  projectIdRules,
  taskIdRules,
  createTaskRules,
  updateTaskRules,
  moveTaskRules,
  createCommentRules,
  aggregateQueryRules,
  projectBoardQueryRules,
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
const { BOARD_SHARE_ACTIONS } = require('../board-shares/constants/boardShare.constants');
const {
  rejectClientPortalUser,
  projectAccess,
  assertTaskAccess,
} = require('./middleware/taskAccess.middleware');

const router = Router();

const canViewTasks = authorize(['tasks.view', 'tasks.manage'], { mode: 'any' });
/** Platform task admins: workflow, members, reports, permanent delete */
const canManageTasks = authorize('tasks.manage');
/** Day-to-day task work on assigned projects (guarded by taskAccess + mutation helpers) */
const canWorkOnTasks = canViewTasks;

const viewProject = projectAccess(BOARD_SHARE_ACTIONS.VIEW_BOARD);
const createOnProject = projectAccess(BOARD_SHARE_ACTIONS.CREATE_TASK);

const viewTask = assertTaskAccess(BOARD_SHARE_ACTIONS.VIEW_TASK);
const editTask = assertTaskAccess(BOARD_SHARE_ACTIONS.EDIT_TASK);
const moveTaskAccess = assertTaskAccess(BOARD_SHARE_ACTIONS.MOVE_TASK);
const commentOnTask = assertTaskAccess(BOARD_SHARE_ACTIONS.COMMENT);
const uploadAttachmentOnTask = assertTaskAccess(BOARD_SHARE_ACTIONS.UPLOAD_ATTACHMENT);

router.use(authenticate);

function assertProjectId(req, res, next) {
  try {
    assertObjectId(req.params.projectId, 'projectId');
    next();
  } catch (err) {
    next(err);
  }
}

function assertTaskId(req, res, next) {
  try {
    assertObjectId(req.params.taskId, 'taskId');
    next();
  } catch (err) {
    next(err);
  }
}

router.get('/projects/:projectId/board', canViewTasks, projectBoardQueryRules, validateRequest, assertProjectId, viewProject, controller.getBoard);
router.get('/projects/:projectId/workflow', canViewTasks, projectIdRules, validateRequest, assertProjectId, viewProject, controller.getWorkflow);
router.get('/projects/:projectId/settings', canViewTasks, projectIdRules, validateRequest, assertProjectId, viewProject, controller.getProjectSettings);
router.patch('/projects/:projectId/settings', canManageTasks, rejectClientPortalUser, updateProjectSettingsRules, validateRequest, assertProjectId, viewProject, controller.updateProjectSettings);
router.patch('/projects/:projectId/workflow/statuses/reorder', canManageTasks, rejectClientPortalUser, reorderWorkflowStatusesRules, validateRequest, assertProjectId, viewProject, controller.reorderWorkflowStatuses);
router.post('/projects/:projectId/workflow/statuses', canManageTasks, rejectClientPortalUser, createWorkflowStatusRules, validateRequest, assertProjectId, viewProject, controller.addWorkflowStatus);
router.patch('/projects/:projectId/workflow/statuses/:statusId', canManageTasks, rejectClientPortalUser, updateWorkflowStatusRules, validateRequest, assertProjectId, viewProject, controller.updateWorkflowStatus);
router.post('/projects/:projectId/workflow/statuses/:statusId/archive', canManageTasks, rejectClientPortalUser, archiveWorkflowStatusRules, validateRequest, assertProjectId, viewProject, controller.archiveWorkflowStatus);
router.get('/projects/:projectId/members', canViewTasks, rejectClientPortalUser, projectIdRules, validateRequest, assertProjectId, viewProject, controller.listMembers);
router.post('/projects/:projectId/members', canManageTasks, rejectClientPortalUser, addProjectMemberRules, validateRequest, assertProjectId, viewProject, controller.addProjectMember);
router.patch('/projects/:projectId/members/:memberId', canManageTasks, rejectClientPortalUser, updateProjectMemberRules, validateRequest, assertProjectId, viewProject, controller.updateProjectMember);
router.delete(
  '/projects/:projectId/members/:memberId',
  canManageTasks,
  rejectClientPortalUser,
  [...projectIdRules, ...memberIdRules],
  validateRequest,
  assertProjectId,
  viewProject,
  controller.removeProjectMember
);
router.get('/projects/:projectId/tasks/archived', canViewTasks, rejectClientPortalUser, projectBoardQueryRules, validateRequest, assertProjectId, viewProject, controller.listArchivedTasks);
router.post('/projects/:projectId/tasks', canWorkOnTasks, createTaskRules, validateRequest, assertProjectId, createOnProject, controller.createTask);

router.get('/inbox', canViewTasks, rejectClientPortalUser, aggregateQueryRules, validateRequest, controller.getInbox);
router.get('/my-tasks', canViewTasks, rejectClientPortalUser, aggregateQueryRules, validateRequest, controller.getMyTasks);

router.get('/notifications/unread-count', canViewTasks, rejectClientPortalUser, notificationQueryRules, validateRequest, controller.getNotificationUnreadCount);
router.post('/notifications/read-all', canViewTasks, rejectClientPortalUser, controller.markAllNotificationsRead);
router.get('/notifications', canViewTasks, rejectClientPortalUser, notificationQueryRules, validateRequest, controller.listNotifications);
router.patch('/notifications/:id/read', canViewTasks, rejectClientPortalUser, notificationIdRules, validateRequest, controller.markNotificationRead);
router.get('/mentions', canViewTasks, rejectClientPortalUser, notificationQueryRules, validateRequest, controller.getMentions);

router.get('/activity', canViewTasks, controller.getActivity);
router.get('/activity/summary', canManageTasks, rejectClientPortalUser, controller.getActivitySummary);
router.get('/calendar', canViewTasks, rejectClientPortalUser, controller.getCalendar);
router.get('/reports/workload', canManageTasks, rejectClientPortalUser, controller.getWorkload);
router.get('/reports/project-health', canManageTasks, rejectClientPortalUser, controller.getProjectHealth);
router.get('/reports', canViewTasks, rejectClientPortalUser, reportsQueryRules, validateRequest, controller.getReports);

router.get('/team/dashboard', canViewTasks, rejectClientPortalUser, teamDashboardQueryRules, validateRequest, controller.getTeamDashboard);
router.get('/team/tasks', canViewTasks, rejectClientPortalUser, teamTasksQueryRules, validateRequest, controller.listTeamTasks);
router.get('/team/users/:userId', canViewTasks, rejectClientPortalUser, teamDashboardQueryRules, validateRequest, controller.getTeamUserDashboard);

router.get('/tasks/:taskId', canViewTasks, taskIdRules, validateRequest, assertTaskId, viewTask, controller.getTask);
router.get('/tasks/:taskId/activity', canViewTasks, taskIdRules, validateRequest, assertTaskId, viewTask, controller.getTaskActivity);
router.patch('/tasks/:taskId', canWorkOnTasks, updateTaskRules, validateRequest, assertTaskId, editTask, controller.updateTask);
router.patch('/tasks/:taskId/move', canViewTasks, moveTaskRules, validateRequest, assertTaskId, moveTaskAccess, controller.moveTask);
router.post('/tasks/:taskId/complete', canWorkOnTasks, taskIdRules, validateRequest, assertTaskId, editTask, controller.completeTask);
router.post('/tasks/:taskId/archive', canWorkOnTasks, rejectClientPortalUser, taskIdRules, validateRequest, assertTaskId, editTask, controller.archiveTask);
router.post('/tasks/:taskId/restore', canWorkOnTasks, rejectClientPortalUser, taskIdRules, validateRequest, assertTaskId, editTask, controller.restoreTask);
router.delete('/tasks/:taskId/permanent', canManageTasks, rejectClientPortalUser, taskIdRules, validateRequest, assertTaskId, editTask, controller.permanentDeleteTask);

router.get('/tasks/:taskId/collaborators', canViewTasks, rejectClientPortalUser, taskIdRules, validateRequest, assertTaskId, viewTask, controller.listCollaborators);
router.post('/tasks/:taskId/collaborators', canViewTasks, rejectClientPortalUser, addCollaboratorRules, validateRequest, assertTaskId, viewTask, controller.addCollaborator);
router.delete(
  '/tasks/:taskId/collaborators/:userId',
  canViewTasks,
  rejectClientPortalUser,
  [...taskIdRules, ...collaboratorUserIdRules],
  validateRequest,
  assertTaskId,
  viewTask,
  controller.removeCollaborator
);

router.get('/tasks/:taskId/comments', canViewTasks, taskIdRules, validateRequest, assertTaskId, viewTask, controller.listComments);
router.post('/tasks/:taskId/comments', canViewTasks, createCommentRules, validateRequest, assertTaskId, commentOnTask, controller.createComment);
router.post('/tasks/:taskId/comment-attachments', canViewTasks, taskIdRules, validateRequest, assertTaskId, commentOnTask, controller.uploadCommentAttachment);
router.post('/tasks/:taskId/attachments', canWorkOnTasks, taskIdRules, validateRequest, assertTaskId, uploadAttachmentOnTask, controller.uploadTaskAttachment);
router.delete(
  '/tasks/:taskId/attachments/:attachmentId',
  canWorkOnTasks,
  [...taskIdRules, ...attachmentIdRules],
  validateRequest,
  assertTaskId,
  uploadAttachmentOnTask,
  controller.deleteTaskAttachment
);

module.exports = router;
