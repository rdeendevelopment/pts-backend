/** Socket.IO namespace for all PTS v2 realtime traffic. */
const SOCKET_NAMESPACE = '/v2';

const ROOM_PREFIX = {
  ACCOUNT: 'account',
  USER: 'user',
  ROLE: 'role',
  PROJECT: 'project',
  TASK: 'task',
  CONVERSATION: 'conversation',
  /** Full room name is discussflow:topic:{topicId} */
  DISCUSSFLOW_TOPIC: 'discussflow:topic',
};

/** Client → server events (room membership is validated server-side). */
const CLIENT_EVENTS = {
  ROOM_JOIN_PROJECT: 'room.join.project',
  ROOM_LEAVE_PROJECT: 'room.leave.project',
  ROOM_JOIN_TASK: 'room.join.task',
  ROOM_LEAVE_TASK: 'room.leave.task',
  ROOM_JOIN_CONVERSATION: 'room.join.conversation',
  ROOM_LEAVE_CONVERSATION: 'room.leave.conversation',
  CONVERSE_TYPING_START: 'converse.typing.start',
  CONVERSE_TYPING_STOP: 'converse.typing.stop',
  CONVERSE_MESSAGE_DELIVERED_ACK: 'converse.message.delivered.ack',
};

/**
 * Server → client event naming standard (dot notation).
 * Modules should reuse these keys instead of inventing new strings.
 */
const SERVER_EVENTS = {
  NOTIFICATION_CREATED: 'notification.created',
  PROJECT_UPDATED: 'project.updated',
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_MOVED: 'task.moved',
  TASK_COMPLETED: 'task.completed',
  TASK_ARCHIVED: 'task.archived',
  TASK_RESTORED: 'task.restored',
  TASK_DELETED: 'task.deleted',
  TASK_COMMENT_CREATED: 'task.comment.created',
  TASK_WORKFLOW_UPDATED: 'task.workflow.updated',
  ACTIVITY_WEEK_SUBMITTED: 'activity.week.submitted',
  ACTIVITY_WEEK_UNSUBMITTED: 'activity.week.unsubmitted',
  ACTIVITY_WEEK_APPROVED: 'activity.week.approved',
  ACTIVITY_WEEK_REJECTED: 'activity.week.rejected',
  ACTIVITY_ENTRY_CREATED: 'activity.entry.created',
  ACTIVITY_TIMER_STARTED: 'activity.timer.started',
  ACTIVITY_TIMER_STOPPED: 'activity.timer.stopped',
  ACTIVITY_WEEK_REMINDER: 'activity.week.reminder',
  CONVERSE_MESSAGE_CREATED: 'converse.message.created',
  CONVERSE_MESSAGE_UPDATED: 'converse.message.updated',
  CONVERSE_MESSAGE_DELETED: 'converse.message.deleted',
  CONVERSE_CONVERSATION_UPDATED: 'converse.conversation.updated',
  CONVERSE_CONVERSATION_JOINED: 'converse.conversation.joined',
  CONVERSE_CONVERSATION_LEFT: 'converse.conversation.left',
  CONVERSE_MEMBERSHIP_UPDATED: 'converse.membership.updated',
  CONVERSE_MESSAGE_READ: 'converse.message.read',
  CONVERSE_MESSAGE_DELIVERED: 'converse.message.delivered',
  CONVERSE_UNREAD_UPDATED: 'converse.unread.updated',
  CONVERSE_TYPING_STARTED: 'converse.typing.started',
  CONVERSE_TYPING_STOPPED: 'converse.typing.stopped',
  PRESENCE_UPDATED: 'presence.updated',
  SYSTEM_ALERT: 'system.alert',
};

const SOCKET_CORS = {
  origin: '*',
  methods: ['GET', 'POST'],
};

module.exports = {
  SOCKET_NAMESPACE,
  ROOM_PREFIX,
  CLIENT_EVENTS,
  SERVER_EVENTS,
  SOCKET_CORS,
};
