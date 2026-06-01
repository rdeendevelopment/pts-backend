const { ENTRY_STATUSES } = require('../../activity/constants/activity.constants');
const {
  DEFAULT_MANAGER_STATUS_FILTER,
  DEFAULT_SELF_STATUS_FILTER,
} = require('../constants/reports.constants');

function normalizeReportStatusFilter(status, { canManageReports = false } = {}) {
  const normalized = status ? String(status).toLowerCase() : null;

  if (normalized && normalized !== 'all') {
    if (!ENTRY_STATUSES.includes(normalized)) {
      return { statuses: DEFAULT_SELF_STATUS_FILTER, explicit: false };
    }
    return { statuses: [normalized], explicit: true };
  }

  if (canManageReports) {
    return { statuses: [...DEFAULT_MANAGER_STATUS_FILTER], explicit: false };
  }

  return { statuses: [...DEFAULT_SELF_STATUS_FILTER], explicit: false };
}

module.exports = {
  normalizeReportStatusFilter,
};
