const { getProjectModel } = require('../../projects/models/project.model');
const { resolveUserIdFromAuth } = require('../helpers/taskAccessScope.helper');
const taskNotificationRepository = require('../repositories/taskNotification.repository');
const { parseNotificationListQuery } = require('../helpers/taskNotificationQuery.helper');
const { toNotificationDto } = require('../dto/task.dto');

const ACTIONABLE = /mention|repl|assigned|responsibility|collaborator_added|review|(?:^|_)qa(?:_|$)|blocked|unblocked|priority.*(?:high|urgent)|due_today|overdue|reopened/i;

function notificationText(row) {
  return `${row.type || ''} ${row.eventKey || ''} ${row.title || ''} ${row.body || ''}`;
}

function isActionableNotification(row) {
  return ACTIONABLE.test(notificationText(row));
}

function isImportantUpdate(row) {
  return isActionableNotification(row);
}

function dayWindow(now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const tomorrow = new Date(start); tomorrow.setDate(tomorrow.getDate() + 1);
  const weekEnd = new Date(start); weekEnd.setDate(weekEnd.getDate() + 7);
  return { start, tomorrow, weekEnd };
}

async function addProjectNames(rows) {
  const ids = [...new Set(rows.map((row) => row.projectId).filter(Boolean).map(String))];
  if (!ids.length) return rows;
  const Project = getProjectModel();
  const projects = await Project.find({ _id: { $in: ids }, isDeleted: false }).select('_id name').lean();
  const names = new Map(projects.map((project) => [String(project._id), project.name || '']));
  return rows.map((row) => ({ ...row, projectName: names.get(String(row.projectId || '')) || '' }));
}

async function getTaskInboxOverview(req, query = {}) {
  const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
  const pagination = parseNotificationListQuery(query);
  const offset = Math.max(0, Number(query.offset) || 0);
  const limit = Math.min(pagination.limit || 15, 15);
  const { items, total } = await taskNotificationRepository.listByUserId(userId, {
    taskOnly: true,
    attentionOnly: true,
    unreadOnly: pagination.unreadOnly,
    skip: offset,
    limit,
  });
  const enriched = await addProjectNames(items.map(toNotificationDto));
  return {
    items: enriched,
    pagination: {
      page: Math.floor(offset / limit) + 1,
      limit,
      offset,
      nextOffset: offset + items.length,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasMore: offset + items.length < total,
    },
  };
}

module.exports = { getTaskInboxOverview, isActionableNotification, isImportantUpdate, dayWindow };
