const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const taskBoardService = require('../services/taskBoard.service');
const taskAccessService = require('../services/taskAccess.service');
const taskCommentService = require('../services/taskComment.service');
const taskAggregateService = require('../services/taskAggregate.service');
const taskNotificationService = require('../services/taskNotification.service');
const taskMentionService = require('../services/taskMention.service');
const taskAttachmentService = require('../services/taskAttachment.service');
const taskProjectSettingsService = require('../services/taskProjectSettings.service');
const taskProjectMemberService = require('../services/taskProjectMember.service');
const taskCollaboratorService = require('../services/taskCollaborator.service');
const taskActivityFeedService = require('../services/taskActivityFeed.service');
const taskCalendarService = require('../services/taskCalendar.service');
const taskReportsService = require('../services/taskReports.service');

async function getBoard(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await taskBoardService.getProjectBoard(projectId, req.query);
  return sendSuccess(res, data);
}

async function getWorkflow(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await taskBoardService.getProjectWorkflow(projectId);
  return sendSuccess(res, data);
}

async function listArchivedTasks(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const items = await taskBoardService.listArchivedTasks(projectId);
  return sendSuccess(res, { items });
}

async function listMembers(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const items = await taskAccessService.listTaskMembers(projectId);
  return sendSuccess(res, { items });
}

async function addProjectMember(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await taskProjectMemberService.addProjectMember(
    projectId,
    req.body,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data, { status: 201 });
}

async function updateProjectMember(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const memberId = assertObjectId(req.params.memberId, 'memberId');
  const data = await taskProjectMemberService.updateProjectMember(
    projectId,
    memberId,
    req.body,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data);
}

async function removeProjectMember(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const memberId = assertObjectId(req.params.memberId, 'memberId');
  const data = await taskProjectMemberService.removeProjectMember(
    projectId,
    memberId,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data);
}

async function listCollaborators(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const items = await taskCollaboratorService.listCollaborators(taskId, req);
  return sendSuccess(res, items);
}

async function addCollaborator(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskCollaboratorService.addCollaborator(
    taskId,
    req.body,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data, { status: 201 });
}

async function removeCollaborator(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const userId = assertObjectId(req.params.userId, 'userId');
  const data = await taskCollaboratorService.removeCollaborator(
    taskId,
    userId,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data);
}

async function permanentDeleteTask(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskBoardService.permanentDeleteTask(taskId, req.v2Auth.accountId);
  return sendSuccess(res, data);
}

async function createTask(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await taskBoardService.createTask(projectId, req.body, req.v2Auth.accountId, req);
  return sendSuccess(res, data, { status: 201 });
}

async function getTask(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskBoardService.getTaskById(taskId);
  return sendSuccess(res, data);
}

async function updateTask(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskBoardService.updateTask(taskId, req.body, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function moveTask(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const workflowStatusId = assertObjectId(
    req.body.workflowStatusId || req.body.statusId,
    'workflowStatusId'
  );
  const data = await taskBoardService.moveTask(
    taskId,
    workflowStatusId,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data);
}

async function completeTask(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskBoardService.completeTask(taskId, req.v2Auth.accountId);
  return sendSuccess(res, data);
}

async function archiveTask(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskBoardService.archiveTask(taskId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function restoreTask(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskBoardService.restoreTask(taskId, req.v2Auth.accountId, req);
  return sendSuccess(res, data);
}

async function listComments(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const items = await taskCommentService.listComments(taskId, req);
  return sendSuccess(res, { items });
}

async function createComment(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskCommentService.createComment(taskId, req.body, req.v2Auth.accountId, req);
  return sendSuccess(res, data, { status: 201 });
}

async function getInbox(req, res) {
  const data = await taskAggregateService.getInbox(req, req.query);
  return sendSuccess(res, data);
}

async function getMyTasks(req, res) {
  const data = await taskAggregateService.getMyTasks(req, req.query);
  return sendSuccess(res, data);
}

async function listNotifications(req, res) {
  const data = await taskNotificationService.listNotifications(req, req.query);
  return sendSuccess(res, data);
}

async function getNotificationUnreadCount(req, res) {
  const data = await taskNotificationService.getUnreadCount(req);
  return sendSuccess(res, data);
}

async function markNotificationRead(req, res) {
  const data = await taskNotificationService.markNotificationRead(req.params.id, req);
  return sendSuccess(res, data);
}

async function markAllNotificationsRead(req, res) {
  const data = await taskNotificationService.markAllNotificationsRead(req);
  return sendSuccess(res, data);
}

async function getMentions(req, res) {
  const data = await taskMentionService.listMentions(req, req.query);
  return sendSuccess(res, data);
}

async function uploadTaskAttachment(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskAttachmentService.uploadTaskAttachment(taskId, req);
  return sendSuccess(res, data, { status: 201 });
}

async function deleteTaskAttachment(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskAttachmentService.deleteTaskAttachment(
    taskId,
    req.params.attachmentId,
    req
  );
  return sendSuccess(res, data);
}

async function uploadCommentAttachment(req, res) {
  const taskId = assertObjectId(req.params.taskId, 'taskId');
  const data = await taskAttachmentService.uploadCommentAttachment(taskId, req);
  return sendSuccess(res, data, { status: 201 });
}

async function getActivity(req, res) {
  const items = await taskActivityFeedService.getActivityFeed(req);
  return sendSuccess(res, items);
}

async function getActivitySummary(req, res) {
  const items = await taskActivityFeedService.getActivitySummary(req);
  return sendSuccess(res, items);
}

async function getCalendar(req, res) {
  const items = await taskCalendarService.getCalendar(req);
  return sendSuccess(res, items);
}

async function getReports(req, res) {
  const data = await taskReportsService.getReports(req, req.query);
  return sendSuccess(res, data);
}

async function getWorkload(req, res) {
  const items = await taskReportsService.getWorkload(req);
  return sendSuccess(res, items);
}

async function getProjectHealth(req, res) {
  const items = await taskReportsService.getProjectHealth(req);
  return sendSuccess(res, items);
}

async function getProjectSettings(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await taskProjectSettingsService.getProjectSettings(projectId, req);
  return sendSuccess(res, data);
}

async function updateProjectSettings(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await taskProjectSettingsService.updateProjectSettings(projectId, req.body, req);
  return sendSuccess(res, data);
}

async function addWorkflowStatus(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await taskProjectSettingsService.addWorkflowStatus(projectId, req.body, req);
  return sendSuccess(res, data, { status: 201 });
}

async function updateWorkflowStatus(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await taskProjectSettingsService.updateWorkflowStatus(
    projectId,
    req.params.statusId,
    req.body,
    req
  );
  return sendSuccess(res, data);
}

async function reorderWorkflowStatuses(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await taskProjectSettingsService.reorderWorkflowStatuses(
    projectId,
    req.body.updates,
    req
  );
  return sendSuccess(res, data);
}

async function archiveWorkflowStatus(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await taskProjectSettingsService.archiveWorkflowStatus(
    projectId,
    req.params.statusId,
    req.body.replacementStatusId,
    req
  );
  return sendSuccess(res, data);
}

module.exports = {
  getBoard: asyncHandler(getBoard),
  getWorkflow: asyncHandler(getWorkflow),
  listArchivedTasks: asyncHandler(listArchivedTasks),
  listMembers: asyncHandler(listMembers),
  addProjectMember: asyncHandler(addProjectMember),
  updateProjectMember: asyncHandler(updateProjectMember),
  removeProjectMember: asyncHandler(removeProjectMember),
  listCollaborators: asyncHandler(listCollaborators),
  addCollaborator: asyncHandler(addCollaborator),
  removeCollaborator: asyncHandler(removeCollaborator),
  permanentDeleteTask: asyncHandler(permanentDeleteTask),
  createTask: asyncHandler(createTask),
  getInbox: asyncHandler(getInbox),
  getMyTasks: asyncHandler(getMyTasks),
  listNotifications: asyncHandler(listNotifications),
  getNotificationUnreadCount: asyncHandler(getNotificationUnreadCount),
  markNotificationRead: asyncHandler(markNotificationRead),
  markAllNotificationsRead: asyncHandler(markAllNotificationsRead),
  getMentions: asyncHandler(getMentions),
  uploadTaskAttachment: asyncHandler(uploadTaskAttachment),
  uploadCommentAttachment: asyncHandler(uploadCommentAttachment),
  deleteTaskAttachment: asyncHandler(deleteTaskAttachment),
  getActivity: asyncHandler(getActivity),
  getActivitySummary: asyncHandler(getActivitySummary),
  getCalendar: asyncHandler(getCalendar),
  getReports: asyncHandler(getReports),
  getWorkload: asyncHandler(getWorkload),
  getProjectHealth: asyncHandler(getProjectHealth),
  getProjectSettings: asyncHandler(getProjectSettings),
  updateProjectSettings: asyncHandler(updateProjectSettings),
  addWorkflowStatus: asyncHandler(addWorkflowStatus),
  updateWorkflowStatus: asyncHandler(updateWorkflowStatus),
  reorderWorkflowStatuses: asyncHandler(reorderWorkflowStatuses),
  archiveWorkflowStatus: asyncHandler(archiveWorkflowStatus),
  getTask: asyncHandler(getTask),
  updateTask: asyncHandler(updateTask),
  moveTask: asyncHandler(moveTask),
  completeTask: asyncHandler(completeTask),
  archiveTask: asyncHandler(archiveTask),
  restoreTask: asyncHandler(restoreTask),
  listComments: asyncHandler(listComments),
  createComment: asyncHandler(createComment),
};
