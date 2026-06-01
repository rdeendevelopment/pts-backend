const { AppError } = require('../../../kernel/errors');
const reportErrorCodes = require('../errors/reportErrorCodes');

function canManageReports(req) {
  const permissions = req.v2Reports?.permissions || [];
  return permissions.includes('reports.manage') || permissions.includes('activity.manage');
}

function assertCanViewUserReport(req, targetUserId) {
  if (canManageReports(req)) return;

  const ownUserId = req.v2Reports?.userId;
  if (!ownUserId || String(ownUserId) !== String(targetUserId)) {
    throw new AppError('Forbidden report access', {
      status: 403,
      code: reportErrorCodes.REPORT_FORBIDDEN,
    });
  }
}

function assertCanViewManagerReport(req) {
  if (!canManageReports(req)) {
    throw new AppError('Forbidden report access', {
      status: 403,
      code: reportErrorCodes.REPORT_FORBIDDEN,
    });
  }
}

module.exports = {
  canManageReports,
  assertCanViewUserReport,
  assertCanViewManagerReport,
};
