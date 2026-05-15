const express        = require('express');
const router         = express.Router();
const { authenticate } = require('../../../Middleware/auth');
const ctrl           = require('../controllers/board.controller');
const boardVal       = require('../middleware/board-validation.middleware');

router.use(authenticate);

// Projects
router.get('/projects',                          ctrl.getProjects);
router.get('/projects/:projectId/board',         ctrl.getBoard);
router.get('/projects/:projectId/archived-tasks', ctrl.listArchivedTasks);
router.get('/projects/:projectId/workflow',      ctrl.getWorkflow);
router.post('/projects/:projectId/tasks',        boardVal.createTaskRules, boardVal.handleValidation, ctrl.createTask);

// Tasks
router.get('/tasks/:taskId',                     ctrl.getTask);
router.put('/tasks/:taskId',                     boardVal.updateTaskRules, boardVal.handleValidation, ctrl.updateTask);
router.put('/tasks/:taskId/move',                boardVal.moveTaskRules, boardVal.handleValidation, ctrl.moveTask);
router.put('/tasks/:taskId/complete',            ctrl.completeTask);
router.delete('/tasks/:taskId/permanent',       ctrl.permanentDeleteTask);
router.delete('/tasks/:taskId',                  ctrl.archiveTask);
router.put('/tasks/:taskId/restore',             ctrl.restoreTask);

router.post('/tasks/:taskId/attachments/upload', ctrl.uploadTaskAttachment);
router.delete('/tasks/:taskId/attachments/:attachmentId', ctrl.deleteTaskAttachment);
router.post('/tasks/:taskId/files/upload',       ctrl.uploadTaskCommentFile);

// Comments
router.get('/tasks/:taskId/comments',            ctrl.getComments);
router.post('/tasks/:taskId/comments',           boardVal.addCommentRules, boardVal.handleValidation, ctrl.addComment);

// Notifications (specific paths before :id)
router.get('/notifications/unread-count',       ctrl.getNotificationUnreadCount);
router.post('/notifications/read-all',          ctrl.markAllNotificationsRead);
router.get('/notifications',                    ctrl.listNotifications);
router.patch('/notifications/:id/read',          ctrl.markNotificationRead);

// Navigation views
router.get('/inbox',                             ctrl.getInbox);
router.get('/my-tasks',                          ctrl.getMyTasks);
router.get('/mentions',                          ctrl.getMentions);
router.get('/activity',                          ctrl.getActivity);
router.get('/activity/summary',                  ctrl.getActivitySummary);
router.get('/calendar',                          ctrl.getCalendar);
// Reports — specific sub-routes before the generic /reports
router.get('/reports/workload',                  ctrl.getWorkload);
router.get('/reports/project-health',            ctrl.getProjectHealth);
router.get('/reports',                           ctrl.getReports);

// Project settings & admin (Phase 6)
router.get('/projects/:projectId/settings',              ctrl.getProjectSettings);
router.put('/projects/:projectId/settings',              ctrl.updateProjectSettings);

// Workflow status management — reorder must precede :statusId
router.post('/projects/:projectId/statuses',             ctrl.addWorkflowStatus);
router.put('/projects/:projectId/statuses/reorder',      boardVal.reorderWorkflowRules, boardVal.handleValidation, ctrl.reorderWorkflowStatuses);
router.put('/projects/:projectId/statuses/:statusId',    ctrl.updateWorkflowStatus);
router.post('/projects/:projectId/statuses/:statusId/archive', ctrl.archiveWorkflowStatus);

// Member management
router.get('/projects/:projectId/members',               ctrl.getProjectMembers);
router.post('/projects/:projectId/members',              ctrl.addProjectMember);
router.put('/projects/:projectId/members/:memberId',     ctrl.updateProjectMember);
router.delete('/projects/:projectId/members/:memberId',  ctrl.removeProjectMember);

// Task collaborators
router.get('/tasks/:taskId/collaborators',               ctrl.getCollaborators);
router.post('/tasks/:taskId/collaborators',              ctrl.addCollaborator);
router.delete('/tasks/:taskId/collaborators/:userId',    ctrl.removeCollaborator);

module.exports = router;
