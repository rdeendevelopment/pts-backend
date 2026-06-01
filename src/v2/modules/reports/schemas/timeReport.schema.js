const { REPORT_PERIODS, REPORT_ENTRY_STATUSES } = require('../constants/reports.constants');

const timeReportFields = {
  period: { type: 'string', enum: REPORT_PERIODS },
  startDate: { type: 'string', format: 'date-time' },
  endDate: { type: 'string', format: 'date-time' },
  status: { type: 'string', enum: REPORT_ENTRY_STATUSES },
  includeEntries: { type: 'boolean' },
};

module.exports = {
  timeReportFields,
};
