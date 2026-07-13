const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const taskCollaboratorRepository = require('../repositories/taskCollaborator.repository');
const { getProjectModel } = require('../../projects/models/project.model');
const taskRepository = require('../repositories/task.repository');
const taskCommentRepository = require('../repositories/taskComment.repository');
const { enrichTask } = require('./taskBoard.service');
const { canManageTasks, resolveUserIdFromAuth } = require('../helpers/taskAccessScope.helper');
const {
  DEFAULT_INBOX_LIMIT,
  DEFAULT_MY_TASKS_LIMIT,
  parsePagination,
  parseAggregateFilters,
  buildPaginationMeta,
} = require('../helpers/taskAggregateQuery.helper');

async function loadProjectNames(projectIds = []) {
  const ids = [...new Set((projectIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return {};

  const Project = getProjectModel();
  const rows = await Project.find({ _id: { $in: ids }, isDeleted: false })
    .select('name')
    .lean();

  return Object.fromEntries(rows.map((row) => [String(row._id), row.name || '']));
}

function buildSelfScopeConditions(
  userId,
  accessibleProjectIds = [],
  mentionedTaskIds = [],
  collaboratorTaskIds = [],
) {
  const relevanceOr = [];

  if (accessibleProjectIds.length) {
    relevanceOr.push({
      $and: [
        { 'assignees.userId': userId },
        { projectId: { $in: accessibleProjectIds } },
      ],
    });
    relevanceOr.push({
      $and: [
        { reviewerId: userId },
        { projectId: { $in: accessibleProjectIds } },
      ],
    });
  }

  if (mentionedTaskIds.length) {
    relevanceOr.push({ _id: { $in: mentionedTaskIds } });
  }

  if (collaboratorTaskIds.length) {
    relevanceOr.push({ _id: { $in: collaboratorTaskIds } });
  }

  return relevanceOr;
}

function buildMyTasksScopeConditions(
  userId,
  accessibleProjectIds = [],
  _mentionedTaskIds = [],
  collaboratorTaskIds = [],
) {
  const relevanceOr = [];

  if (accessibleProjectIds.length) {
    relevanceOr.push({
      $and: [
        { 'assignees.userId': userId },
        { projectId: { $in: accessibleProjectIds } },
      ],
    });
  }

  if (collaboratorTaskIds.length) {
    relevanceOr.push({ _id: { $in: collaboratorTaskIds } });
  }

  return relevanceOr;
}

async function enrichAggregateTasks(tasks = []) {
  const projectNames = await loadProjectNames(tasks.map((task) => task.projectId));
  return Promise.all(tasks.map(async (task) => {
    const dto = await enrichTask(task);
    return {
      ...dto,
      projectName: projectNames[String(task.projectId)] || '',
    };
  }));
}

async function listAggregateView(req, query, {
  baseStatus,
  statusNe,
  defaultLimit,
  defaultSort,
  buildScope,
  includeMentions = false,
}) {
  const filters = parseAggregateFilters(query);
  const pagination = parsePagination(query, { defaultLimit });
  const isManager = canManageTasks(req);

  if (baseStatus && !filters.status) filters.baseStatus = baseStatus;
  if (statusNe && !filters.status) filters.statusNe = statusNe;

  if (!isManager) {
    const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
    const [accessibleProjectIds, mentionedTaskIds, collaboratorTaskIds] = await Promise.all([
      projectAssignmentRepository.listActiveProjectIdsByUserId(userId),
      includeMentions
        ? taskCommentRepository.findMentionedTaskIds(userId)
        : Promise.resolve([]),
      taskCollaboratorRepository.listActiveTaskIdsByUserId(userId),
    ]);

    const relevanceOr = buildScope(userId, accessibleProjectIds, mentionedTaskIds, collaboratorTaskIds);
    if (!relevanceOr.length) {
      return {
        items: [],
        pagination: buildPaginationMeta({ ...pagination, total: 0 }),
      };
    }
    filters.relevanceOr = relevanceOr;
  }

  const sort = defaultSort;
  const { items, total } = await taskRepository.listAggregate(filters, {
    sort,
    skip: pagination.skip,
    limit: pagination.limit,
  });

  const enriched = await enrichAggregateTasks(items);

  return {
    items: enriched,
    pagination: buildPaginationMeta({ ...pagination, total }),
  };
}

async function getInbox(req, query = {}) {
  return listAggregateView(req, query, {
    baseStatus: 'active',
    defaultLimit: DEFAULT_INBOX_LIMIT,
    defaultSort: { updatedAt: -1, createdAt: -1 },
    buildScope: buildSelfScopeConditions,
    includeMentions: true,
  });
}

async function getMyTasks(req, query = {}) {
  return listAggregateView(req, query, {
    statusNe: 'archived',
    defaultLimit: DEFAULT_MY_TASKS_LIMIT,
    defaultSort: { dueDate: 1, createdAt: -1 },
    buildScope: buildMyTasksScopeConditions,
  });
}

async function getMyTasksSummary(req, query = {}) {
  const filters = parseAggregateFilters(query);
  if (!filters.status) filters.statusNe = 'archived';

  if (!canManageTasks(req)) {
    const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
    const [accessibleProjectIds, collaboratorTaskIds] = await Promise.all([
      projectAssignmentRepository.listActiveProjectIdsByUserId(userId),
      taskCollaboratorRepository.listActiveTaskIdsByUserId(userId),
    ]);
    const relevanceOr = buildMyTasksScopeConditions(
      userId,
      accessibleProjectIds,
      [],
      collaboratorTaskIds
    );
    if (!relevanceOr.length) {
      return { total: 0, open: 0, completed: 0, overdue: 0, highPriority: 0, dueToday: 0 };
    }
    filters.relevanceOr = relevanceOr;
  }

  return taskRepository.summarizeAggregate(filters);
}

module.exports = {
  getInbox,
  getMyTasks,
  getMyTasksSummary,
  buildSelfScopeConditions,
  buildMyTasksScopeConditions,
};
