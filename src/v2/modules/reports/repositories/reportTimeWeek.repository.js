const { getTimeWeekModel } = require('../../activity/models/timeWeek.model');

function buildWeekApprovalQuery(filters = {}) {
  const query = { isDeleted: false };

  if (filters.userId) query.userId = filters.userId;
  if (filters.status) query.status = filters.status;

  if (filters.weekStartDate) {
    query.weekStartDate = new Date(filters.weekStartDate);
  }

  if (filters.weekStartFrom || filters.weekStartTo) {
    query.weekStartDate = {};
    if (filters.weekStartFrom) query.weekStartDate.$gte = filters.weekStartFrom;
    if (filters.weekStartTo) query.weekStartDate.$lte = filters.weekStartTo;
  }

  return query;
}

async function listWeeksForApproval(filters = {}) {
  const TimeWeek = getTimeWeekModel();
  return TimeWeek.find(buildWeekApprovalQuery(filters))
    .sort({ weekStartDate: -1, userId: 1 })
    .lean()
    .exec();
}

module.exports = {
  buildWeekApprovalQuery,
  listWeeksForApproval,
};
