const reportRepo = require('../Repositories/report.repository');

function getProjectDashboard(projectId) {
  return reportRepo.getProjectDashboard(projectId);
}

function getProjectTimeEntries(projectId, filters = {}) {
  return reportRepo.getProjectTimeEntries(projectId, filters);
}

module.exports = {
  getProjectDashboard,
  getProjectTimeEntries,
  labelMinutes: reportRepo.labelMinutes,
};
