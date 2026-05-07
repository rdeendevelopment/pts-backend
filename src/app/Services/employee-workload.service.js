const reportRepo = require('../Repositories/report.repository');

function getEmployeeWorkload(actor, targetUserId, access, query = {}) {
  return reportRepo.getEmployeeWorkload(actor, targetUserId, access, query);
}

module.exports = { getEmployeeWorkload };
