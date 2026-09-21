const { getTaskModel } = require('../models/task.model');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const taskCollaboratorRepository = require('../repositories/taskCollaborator.repository');
const {
  canViewAllTaskProjects,
  resolveUserIdFromAuth,
} = require('../helpers/taskAccessScope.helper');
const { parseAggregateFilters } = require('../helpers/taskAggregateQuery.helper');

/**
 * Lightweight dashboard task query - optimized for Dashboard widget
 * Returns at most 8 tasks with minimal joins
 * Calculates summary against complete authorized result set
 */

async function getDashboardTasksAndSummary(req, query = {}) {
  const Task = getTaskModel();
  const queryStart = process.env.DEBUG_TIMING ? Date.now() : null;

  const filters = parseAggregateFilters(query);
  filters.statusNe = 'archived';

  // Build authorization: either manager can see all, or user sees assigned + collaborator tasks
  if (!canViewAllTaskProjects(req)) {
    const userId = await resolveUserIdFromAuth(req.v2Auth.accountId);
    const [accessibleProjectIds, collaboratorTaskIds] = await Promise.all([
      projectAssignmentRepository.listActiveProjectIdsByUserId(userId),
      taskCollaboratorRepository.listActiveTaskIdsByUserId(userId),
    ]);

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
      relevanceOr.push({ _id: { $in: collaboratorTaskIds }, projectId: { $in: accessibleProjectIds } });
    }

    if (!relevanceOr.length) {
      return {
        items: [],
        summary: { total: 0, open: 0, completed: 0, overdue: 0, dueToday: 0, highPriority: 0 },
      };
    }
    filters.relevanceOr = relevanceOr;
  }

  // Run items and summary in parallel using Promise.all
  const itemsStart = queryStart ? Date.now() : null;
  const summaryStart = queryStart ? Date.now() : null;

  const [items, summary] = await Promise.all([
    getDashboardItems(Task, filters)
      .then((result) => {
        if (queryStart) {
          const elapsed = Date.now() - itemsStart;
          console.log(`[DASHBOARD] items query: ${elapsed}ms`);
        }
        return result;
      }),
    // Summary query - count all matching tasks
    getDashboardTasksSummary(Task, filters)
      .then((result) => {
        if (queryStart) {
          const elapsed = Date.now() - summaryStart;
          console.log(`[DASHBOARD] summary query: ${elapsed}ms`);
        }
        return result;
      }),
  ]);

  if (queryStart) {
    const totalElapsed = Date.now() - queryStart;
    console.log(`[DASHBOARD] total query time: ${totalElapsed}ms`);
  }

  return {
    items,
    summary,
  };
}

async function getDashboardItems(Task, filters) {
  // Use aggregation to apply filters consistently with summary query
  const pipeline = [];

  // Build match stage from filters
  if (filters.relevanceOr) {
    pipeline.push({ $match: { $or: filters.relevanceOr } });
  } else if (filters.projectId) {
    pipeline.push({ $match: { projectId: filters.projectId, isDeleted: false } });
  } else {
    pipeline.push({ $match: { isDeleted: false } });
  }

  // Add status filter if present
  if (filters.status) {
    pipeline.push({ $match: { status: filters.status } });
  } else if (filters.statusNe) {
    pipeline.push({ $match: { status: { $ne: filters.statusNe } } });
  }

  // Sort and limit
  pipeline.push(
    { $sort: { dueDate: 1, createdAt: -1 } },
    {
      $project: {
        _id: 1,
        title: 1,
        status: 1,
        priority: 1,
        dueDate: 1,
        projectId: 1,
        projectName: 1,
        assigneeId: 1,
        assigneeName: 1,
      },
    },
    { $limit: 8 }
  );

  return Task.aggregate(pipeline);
}

async function getDashboardTasksSummary(Task, filters) {
  // Use aggregation to count summary metrics against filtered dataset
  // This matches the same authorization scope as the items query
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(today);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const pipeline = [];

  // Build match stage from filters
  if (filters.relevanceOr) {
    pipeline.push({ $match: { $or: filters.relevanceOr } });
  } else if (filters.projectId) {
    pipeline.push({ $match: { projectId: filters.projectId, isDeleted: false } });
  } else {
    pipeline.push({ $match: { isDeleted: false } });
  }

  // Add status filter if present
  if (filters.status) {
    pipeline.push({ $match: { status: filters.status } });
  } else if (filters.statusNe) {
    pipeline.push({ $match: { status: { $ne: filters.statusNe } } });
  }

  // Add facet for all summary counts
  pipeline.push({
    $facet: {
      total: [{ $count: 'count' }],
      open: [
        { $match: { status: { $nin: ['completed', 'archived'] } } },
        { $count: 'count' },
      ],
      completed: [
        { $match: { status: 'completed' } },
        { $count: 'count' },
      ],
      overdue: [
        { $match: { status: { $nin: ['completed', 'archived'] }, dueDate: { $lt: today } } },
        { $count: 'count' },
      ],
      dueToday: [
        { $match: { status: { $nin: ['completed', 'archived'] }, dueDate: { $gte: today, $lt: tomorrowStart } } },
        { $count: 'count' },
      ],
      highPriority: [
        { $match: { status: { $nin: ['completed', 'archived'] }, priority: 'high' } },
        { $count: 'count' },
      ],
    },
  });

  const result = await Task.aggregate(pipeline);
  const facets = result[0] || {};

  return {
    total: facets.total?.[0]?.count || 0,
    open: facets.open?.[0]?.count || 0,
    completed: facets.completed?.[0]?.count || 0,
    overdue: facets.overdue?.[0]?.count || 0,
    dueToday: facets.dueToday?.[0]?.count || 0,
    highPriority: facets.highPriority?.[0]?.count || 0,
  };
}

module.exports = {
  getDashboardTasksAndSummary,
};
