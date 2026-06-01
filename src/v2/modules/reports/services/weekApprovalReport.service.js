const userRepository = require('../../users/repositories/user.repository');
const reportTimeWeekRepository = require('../repositories/reportTimeWeek.repository');
const {
  assertCanViewManagerReport,
  assertCanViewUserReport,
} = require('../helpers/access.helper');
const { toWeekApprovalRow } = require('../dto/report.dto');

function buildWeekFilters(parsedQuery, req) {
  const filters = {};

  if (parsedQuery.userId) {
    assertCanViewUserReport(req, parsedQuery.userId);
    filters.userId = parsedQuery.userId;
  } else if (!parsedQuery.canManageReports) {
    filters.userId = req.v2Reports.userId;
  } else {
    assertCanViewManagerReport(req);
  }

  if (parsedQuery.status) filters.status = parsedQuery.status;

  if (parsedQuery.weekStartDate) {
    filters.weekStartDate = parsedQuery.weekStartDate;
  }

  if (parsedQuery.startDate || parsedQuery.endDate) {
    filters.weekStartFrom = parsedQuery.startDate ? new Date(parsedQuery.startDate) : null;
    filters.weekStartTo = parsedQuery.endDate ? new Date(parsedQuery.endDate) : null;
    if (filters.weekStartTo) {
      filters.weekStartTo.setUTCHours(23, 59, 59, 999);
    }
  }

  return filters;
}

async function getWeekApprovalReport(parsedQuery, req) {
  const filters = buildWeekFilters(parsedQuery, req);
  const weeks = await reportTimeWeekRepository.listWeeksForApproval(filters);

  const userIds = [...new Set(weeks.map((week) => String(week.userId)))];
  const users = await Promise.all(userIds.map((id) => userRepository.findById(id)));
  const usersById = new Map(users.filter(Boolean).map((user) => [String(user._id), user]));

  return {
    items: weeks.map((week) => toWeekApprovalRow(week, usersById.get(String(week.userId)))),
    total: weeks.length,
  };
}

module.exports = {
  getWeekApprovalReport,
};
