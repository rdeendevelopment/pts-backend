const projectRepository = require('../../projects/repositories/project.repository');

async function buildEntryFilters(parsedQuery, { userId = null, userIds = null } = {}) {
  const filters = {
    entryDateFrom: parsedQuery.dateRange.startDate,
    entryDateTo: parsedQuery.dateRange.endDate,
    statuses: parsedQuery.statuses,
  };

  if (userId) filters.userId = userId;
  if (userIds?.length) filters.userIds = userIds;
  if (parsedQuery.projectId) filters.projectId = parsedQuery.projectId;
  if (parsedQuery.workCategoryId) filters.workCategoryId = parsedQuery.workCategoryId;
  if (parsedQuery.taskId) filters.taskId = parsedQuery.taskId;

  if (parsedQuery.clientId) {
    const { items } = await projectRepository.listProjects(
      { clientId: parsedQuery.clientId },
      { limit: 500 }
    );
    filters.projectIds = items.map((project) => project._id);
  }

  return filters;
}

module.exports = {
  buildEntryFilters,
};
