const taskCollaboratorRepository = require('../repositories/taskCollaborator.repository');
const taskNotificationService = require('./taskNotification.service');
const userRepository = require('../../users/repositories/user.repository');

async function participantIds(task) {
  if (!task) return [];
  const collaborators = await taskCollaboratorRepository.listActiveByTaskId(task._id);
  return [...new Set([
    task.primaryAssigneeId,
    task.assignees?.[0]?.userId,
    task.reviewerId,
    ...collaborators.map((row) => row.userId),
  ].filter(Boolean).map(String))];
}

async function actorName(accountId) {
  const user = accountId ? await userRepository.findByAccountId(accountId) : null;
  return user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || '';
}

async function notifyRecipients(task, actorId, event) {
  const recipients = [...new Set((event.recipientIds || await participantIds(task)).map(String))];
  const name = await actorName(actorId);
  return Promise.all(recipients.map((userId) => taskNotificationService.createAndEmitNotification({
    userId, taskId: task._id, projectId: task.projectId, entityType: 'task',
    entityId: String(task._id), actorId, actorName: name,
    type: event.type, category: event.category, title: task.title || 'Task', message: event.message,
    priority: event.priority || 'normal', metadata: { taskTitle: task.title || 'Task', taskDisplayId: task.displayId || task.taskNumber || null, ...(event.metadata || {}) },
    dedupeKey: event.dedupeKey ? `${event.dedupeKey}:${userId}` : null,
    aggregationKey: event.aggregationKey || `${task._id}:${event.type}`,
  })));
}

function materiallyChangedDate(before, after) {
  const a = before ? new Date(before).getTime() : null;
  const b = after ? new Date(after).getTime() : null;
  return a !== b;
}

async function taskUpdated({ before, after, actorId, fields = [] }) {
  const events = [];
  const beforePrimary = String(before.primaryAssigneeId || before.assignees?.[0]?.userId || '');
  const afterPrimary = String(after.primaryAssigneeId || after.assignees?.[0]?.userId || '');
  if (beforePrimary !== afterPrimary && afterPrimary) {
    events.push({ type: beforePrimary ? 'task_responsibility_transferred' : 'task_primary_assigned',
      message: beforePrimary ? 'Task responsibility was transferred to you' : 'You were assigned this task',
      recipientIds: [afterPrimary], dedupeKey: `${after._id}:primary:${afterPrimary}:${after.updatedAt}` });
  }
  if (beforePrimary !== afterPrimary && beforePrimary) {
    events.push({ type: 'task_primary_assignment_removed', category: 'assignment',
      message: afterPrimary ? 'Your primary assignment was transferred to someone else' : 'Your assignment on this task was removed',
      recipientIds: [beforePrimary], dedupeKey: `${after._id}:primary-removed:${beforePrimary}:${after.updatedAt}` });
  }
  if (fields.includes('dueDate') && materiallyChangedDate(before.dueDate, after.dueDate)) {
    const oldDueDate = before.dueDate ? new Date(before.dueDate).toISOString() : null;
    const newDueDate = after.dueDate ? new Date(after.dueDate).toISOString() : null;
    const message = !oldDueDate ? 'A due date was added to this task'
      : !newDueDate ? 'The due date was removed from this task' : 'The due date changed';
    events.push({ type: 'task_due_date_changed', message,
      dedupeKey: `${after._id}:due:${oldDueDate || 'none'}:${newDueDate || 'none'}`,
      metadata: { oldDueDate, newDueDate } });
  }
  if (fields.includes('priority') && ['high', 'urgent', 'critical'].includes(after.priority)
      && before.priority !== after.priority) {
    events.push({ type: 'task_priority_escalated', message: `Priority changed to ${after.priority}`,
      priority: 'high', dedupeKey: `${after._id}:priority:${after.priority}:${after.updatedAt}` });
  }
  for (const event of events) await notifyRecipients(after, actorId, event);
}

async function workflowMoved({ before, after, targetStatus, actorId }) {
  if (String(before.workflowStatusId) === String(after.workflowStatusId)) return [];
  const name = String(targetStatus?.name || '').toLowerCase();
  const previousName = String(before.workflowStatusName || '').toLowerCase();
  let type = 'task_status_changed';
  if (/review/.test(name)) type = 'task_moved_to_review';
  else if (/\bqa\b|quality assurance/.test(name)) type = 'task_moved_to_qa';
  else if (/block/.test(name)) type = 'task_blocked';
  else if (/block/.test(previousName)) type = 'task_unblocked';
  const priority = /review|_qa|blocked/.test(type) ? 'high' : 'normal';
  await notifyRecipients(after, actorId, { type, message: `Task moved to ${targetStatus?.name || 'a new status'}`,
    priority,
    dedupeKey: `${after._id}:move:${after.workflowStatusId}:${after.updatedAt}`,
    metadata: { fromStatusId: String(before.workflowStatusId), toStatusId: String(after.workflowStatusId) } });
}

async function lifecycle(task, actorId, type, message) {
  return notifyRecipients(task, actorId, { type, message,
    dedupeKey: `${task._id}:${type}:${task.updatedAt}` });
}

async function collaboratorChanged(task, actorId, collaboratorUserId, change, previousAccessType = null, accessType = null) {
  const type = change === 'access_changed' ? 'task_collaborator_access_changed'
    : change === 'added' ? 'task_collaborator_added' : 'task_collaborator_removed';
  const message = change === 'access_changed'
    ? `Your task access changed from ${previousAccessType} to ${accessType}`
    : change === 'added' ? `You were added as a ${accessType || 'task'} collaborator` : 'Your collaborator access to this task was removed';
  return notifyRecipients(task, actorId, {
    type, category: 'collaboration', message,
    recipientIds: [String(collaboratorUserId)],
    dedupeKey: `${task._id}:collaborator:${collaboratorUserId}:${change}:${accessType || ''}:${task.updatedAt}`,
    metadata: { taskOnlyLink: true, previousAccessType, accessType },
  });
}

async function commentReply(task, actorId, parentComment, replyComment, excludedUserIds = []) {
  if (!parentComment?.authorId) return [];
  const recipient = await userRepository.findByAccountId(parentComment.authorId);
  if (!recipient) return [];
  if (excludedUserIds.some((id) => String(id) === String(recipient._id))) return [];
  return notifyRecipients(task, actorId, {
    type: 'task_comment_replied', message: 'Someone replied to your task comment',
    recipientIds: [String(recipient._id)],
    dedupeKey: `${task._id}:reply:${parentComment._id}:${replyComment?._id || actorId}`,
  });
}

module.exports = { participantIds, taskUpdated, workflowMoved, lifecycle, collaboratorChanged, commentReply, notifyRecipients };
