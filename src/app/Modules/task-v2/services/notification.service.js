/**
 * Task V2 inbox notifications (persisted).
 * Dedupe: task_assigned upserts per (recipient, task); mentions keyed by sourceCommentId.
 */
const mongoose = require('mongoose');
const { TaskNotificationV2 } = require('../models');

function pingRecipientSocket(recipientId) {
  if (!recipientId) return;
  try {
    const { notifyV2User } = require('../sockets/task-v2.socket');
    notifyV2User(String(recipientId), 'notificationsUpdated', { reason: 'task_v2' });
  } catch (_) {
    /* non-critical */
  }
}

function err(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function snippet(text, max = 160) {
  const s = String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Upsert assignment notification for recipient (no duplicate per task).
 */
async function upsertTaskAssigned(recipientId, task, triggeredBy, triggeredByName) {
  if (!recipientId || !task || !task._id) return;
  const rid = String(recipientId);
  const tid = String(triggeredBy);
  if (rid === tid) return;

  const title = task.title || 'Task';
  await TaskNotificationV2.findOneAndUpdate(
    {
      recipientId,
      taskId: task._id,
      type: 'task_assigned',
    },
    {
      $set: {
        recipientId,
        taskId: task._id,
        type: 'task_assigned',
        projectRef: task.projectRef || {},
        triggeredBy,
        triggeredByName: triggeredByName || '',
        taskTitle: title,
        message: `${triggeredByName || 'Someone'} assigned you to "${snippet(title, 80)}"`,
        isRead: false,
        readAt: null,
        sourceCommentId: null,
      },
    },
    { upsert: true, new: true },
  );
  pingRecipientSocket(recipientId);
}

async function notifyAssigneesOnCreate(task, actorId, actorName) {
  if (!task || !task.assignees || !task.assignees.length) return;
  const aid = String(actorId);
  for (const a of task.assignees) {
    const uid = String(a.userId || '').trim();
    if (!uid || uid === aid) continue;
    await upsertTaskAssigned(uid, task, actorId, actorName);
  }
}

async function notifyNewAssignees(task, addedUserIds, actorId, actorName) {
  if (!addedUserIds || !addedUserIds.length) return;
  const aid = String(actorId);
  for (const uid of addedUserIds) {
    const id = String(uid || '').trim();
    if (!id || id === aid) continue;
    await upsertTaskAssigned(id, task, actorId, actorName);
  }
}

async function notifyMention(recipientId, task, commentId, triggeredBy, triggeredByName) {
  if (!recipientId || !task || !task._id || !commentId) return;
  const rid = String(recipientId).trim();
  const tid = String(triggeredBy);
  if (!rid || rid === tid) return;

  const exists = await TaskNotificationV2.findOne({
    recipientId,
    taskId: task._id,
    type: 'task_mentioned',
    sourceCommentId: commentId,
  }).lean();
  if (exists) return;

  await TaskNotificationV2.create({
    recipientId,
    taskId: task._id,
    projectRef: task.projectRef || {},
    type: 'task_mentioned',
    triggeredBy,
    triggeredByName: triggeredByName || '',
    taskTitle: task.title || '',
    message: `${triggeredByName || 'Someone'} mentioned you in "${snippet(task.title || 'Task', 60)}"`,
    sourceCommentId: commentId,
    isRead: false,
  });
  pingRecipientSocket(recipientId);
}

async function listNotifications(actorId, limit = 50) {
  const lid = String(actorId || '').trim();
  if (!lid) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const rows = await TaskNotificationV2.find({ recipientId: lid })
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();
  return rows.map((r) => ({
    ...r,
    _id: String(r._id),
    taskId: String(r.taskId),
    sourceCommentId: r.sourceCommentId ? String(r.sourceCommentId) : null,
  }));
}

async function unreadCount(actorId) {
  const lid = String(actorId || '').trim();
  if (!lid) return 0;
  return TaskNotificationV2.countDocuments({ recipientId: lid, isRead: false });
}

async function markRead(notificationId, actorId) {
  const lid = String(actorId || '').trim();
  if (!lid) throw err('Unauthorized', 403);
  if (!mongoose.Types.ObjectId.isValid(notificationId)) throw err('Invalid notification id', 400);

  const n = await TaskNotificationV2.findOneAndUpdate(
    { _id: notificationId, recipientId: lid },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  ).lean();

  if (!n) throw err('Notification not found', 404);
  return {
    ...n,
    _id: String(n._id),
    taskId: String(n.taskId),
    sourceCommentId: n.sourceCommentId ? String(n.sourceCommentId) : null,
  };
}

async function markAllRead(actorId) {
  const lid = String(actorId || '').trim();
  if (!lid) throw err('Unauthorized', 403);
  await TaskNotificationV2.updateMany(
    { recipientId: lid, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  return { success: true };
}

module.exports = {
  snippet,
  upsertTaskAssigned,
  notifyAssigneesOnCreate,
  notifyNewAssignees,
  notifyMention,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
};
