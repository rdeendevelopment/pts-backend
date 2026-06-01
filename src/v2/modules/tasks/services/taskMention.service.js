const accountRepository = require('../../auth/repositories/account.repository');
const userRepository = require('../../users/repositories/user.repository');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const { getProjectModel } = require('../../projects/models/project.model');
const { getTaskModel } = require('../models/task.model');
const taskCommentRepository = require('../repositories/taskComment.repository');
const {
  canManageTasks,
  findUserIdFromAuth,
  resolveUserIdFromAuth,
} = require('../helpers/taskAccessScope.helper');
const {
  parseNotificationListQuery,
  canViewMentionTask,
} = require('../helpers/taskNotificationQuery.helper');
const { buildPaginationMeta } = require('../helpers/taskAggregateQuery.helper');
const { toMentionDto } = require('../dto/task.dto');

async function resolveAuthorsByAccountIds(accountIds = []) {
  const ids = [...new Set((accountIds || []).map((id) => String(id)).filter(Boolean))];
  const map = {};

  await Promise.all(ids.map(async (accountId) => {
    const [account, user] = await Promise.all([
      accountRepository.findById(accountId),
      userRepository.findByAccountId(accountId),
    ]);
    map[accountId] = user || {
      email: account?.email || '',
      displayName: account?.email || '',
    };
  }));

  return map;
}

async function loadProjectNames(projectIds = []) {
  const ids = [...new Set((projectIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return {};

  const Project = getProjectModel();
  const rows = await Project.find({ _id: { $in: ids }, isDeleted: false })
    .select('name')
    .lean();

  return Object.fromEntries(rows.map((row) => [String(row._id), row.name || '']));
}

async function listMentions(req, query = {}) {
  const isManager = canManageTasks(req);
  const userId = isManager
    ? await findUserIdFromAuth(req.v2Auth.accountId)
    : await resolveUserIdFromAuth(req.v2Auth.accountId);

  if (!userId) {
    const pagination = parseNotificationListQuery(query);
    return {
      items: [],
      pagination: buildPaginationMeta({ ...pagination, total: 0 }),
    };
  }

  const pagination = parseNotificationListQuery(query);

  const { items: comments, total: rawTotal } = await taskCommentRepository.listMentionsByUserId(
    userId,
    { skip: pagination.skip, limit: pagination.limit }
  );

  if (!comments.length) {
    return {
      items: [],
      pagination: buildPaginationMeta({ ...pagination, total: 0 }),
    };
  }

  const accessibleProjectIds = isManager
    ? []
    : await projectAssignmentRepository.listActiveProjectIdsByUserId(userId);

  const taskIds = [...new Set(comments.map((row) => String(row.taskId)).filter(Boolean))];
  const authorIds = [...new Set(comments.map((row) => String(row.authorId)).filter(Boolean))];
  const projectIds = [...new Set(comments.map((row) => String(row.projectId)).filter(Boolean))];

  const Task = getTaskModel();
  const taskDocs = taskIds.length
    ? await Task.find({ _id: { $in: taskIds }, isDeleted: false })
      .select('title taskNumber projectId assignees reviewerId status')
      .lean()
    : [];

  const [authorMap, projectNames] = await Promise.all([
    resolveAuthorsByAccountIds(authorIds),
    loadProjectNames(projectIds),
  ]);

  const taskMap = Object.fromEntries(taskDocs.map((task) => [String(task._id), task]));
  const rows = [];

  for (const comment of comments) {
    const task = taskMap[String(comment.taskId)];
    if (!canViewMentionTask(task, userId, accessibleProjectIds, isManager)) {
      continue;
    }

    rows.push(toMentionDto({
      comment,
      task,
      project: { _id: comment.projectId, name: projectNames[String(comment.projectId)] || '' },
      author: authorMap[String(comment.authorId)],
    }));
  }

  return {
    items: rows,
    pagination: buildPaginationMeta({
      ...pagination,
      total: rows.length < comments.length ? rows.length : rawTotal,
    }),
  };
}

module.exports = {
  listMentions,
};
