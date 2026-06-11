const { info } = require('../../../kernel/logger');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const userRepository = require('../../users/repositories/user.repository');
const endDayReportRepository = require('../repositories/dailyFlowEndDayReport.repository');
const { toAdminDailyReportDto } = require('../dto/dailyFlow.dto');
const { assertValidDayKey } = require('../helpers/dayKey.helper');
const { resolveAccountIdForUserId } = require('../helpers/account.helper');
const { parseListLimit } = require('../helpers/pagination.helper');

async function resolveUserSummary(userId) {
  const user = await userRepository.findById(userId);
  if (!user) return null;
  return {
    id: String(user._id),
    display_name: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    email: user.email || null,
    job_title: user.jobTitle || null,
  };
}

async function listDailyReports(query = {}) {
  const date = assertValidDayKey(query.date || query.day_key || query.dayKey);
  const filters = { dayKey: date };

  if (query.user_id || query.userId) {
    filters.userId = assertObjectId(query.user_id || query.userId, 'user_id');
  }
  if (query.status) filters.status = String(query.status);

  info('Daily Flow listDailyReports', { date, filters });

  const { items, total } = await endDayReportRepository.listReports(filters, {
    limit: parseListLimit(query.limit, 50, 200),
    skip: Number(query.skip) || 0,
  });

  const userIds = [...new Set(items.map((row) => String(row.userId)).filter(Boolean))];
  const users = await Promise.all(userIds.map((id) => resolveUserSummary(id)));
  const userMap = new Map(users.filter(Boolean).map((u) => [u.id, u]));

  return {
    date,
    items: items.map((report) => toAdminDailyReportDto(report, userMap.get(String(report.userId)))),
    total,
  };
}

async function getDailyReportDetail(userIdInput, dateInput) {
  const userId = assertObjectId(userIdInput, 'user_id');
  const date = assertValidDayKey(dateInput);
  const accountId = await resolveAccountIdForUserId(userId);

  const report = await endDayReportRepository.findByAccountAndDayKey(accountId, date);
  if (!report) {
    return null;
  }

  const user = await resolveUserSummary(userId);
  return toAdminDailyReportDto(report, user, { includeDetails: true });
}

module.exports = {
  listDailyReports,
  getDailyReportDetail,
};
