const { AppError } = require('../../../kernel/errors');
const reportErrorCodes = require('../errors/reportErrorCodes');
const { REPORT_PERIODS } = require('../constants/reports.constants');
const {
  getWeekBounds,
  getDayBounds,
  getMonthBounds,
  getBusinessTimezone,
  getWeekStartDay,
} = require('../../activity/helpers/week.helper');

function parseDateInput(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid report date', {
      status: 400,
      code: reportErrorCodes.REPORT_INVALID_DATE_RANGE,
      details: { value },
    });
  }
  return date;
}

function buildBiWeeklyBounds(anchorDate, timeZone, weekStartDay) {
  const { weekStartDate } = getWeekBounds(anchorDate, timeZone, weekStartDay);
  const referenceStart = getWeekBounds(new Date(0), timeZone, weekStartDay).weekStartDate;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceReference = Math.floor((weekStartDate.getTime() - referenceStart.getTime()) / msPerWeek);
  const alignedWeeks = Math.floor(weeksSinceReference / 2) * 2;

  const startDate = new Date(referenceStart);
  startDate.setUTCDate(startDate.getUTCDate() + alignedWeeks * 7);

  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 13);
  endDate.setUTCHours(23, 59, 59, 999);

  return { startDate, endDate };
}

/**
 * Resolve report date windows.
 * Weekly/bi-weekly windows follow Activity week config (PTS_V2_WEEK_START_DAY).
 */
function buildDateRange({
  period = 'weekly',
  startDate = null,
  endDate = null,
  anchorDate = new Date(),
  weekStartDay = getWeekStartDay(),
  timeZone = getBusinessTimezone(),
} = {}) {
  const normalizedPeriod = String(period).toLowerCase();

  if (!REPORT_PERIODS.includes(normalizedPeriod)) {
    throw new AppError('Invalid report period', {
      status: 400,
      code: reportErrorCodes.REPORT_INVALID_PERIOD,
      details: { period, allowed: REPORT_PERIODS },
    });
  }

  const anchor = parseDateInput(anchorDate) || new Date();

  if (normalizedPeriod === 'daily') {
    const dayInput = parseDateInput(startDate) || anchor;
    const { dayStart, dayEnd } = getDayBounds(dayInput, timeZone);
    return {
      period: normalizedPeriod,
      startDate: dayStart,
      endDate: dayEnd,
      weekStartDay: getWeekStartDay(),
      timeZone,
    };
  }

  if (normalizedPeriod === 'weekly') {
    const { weekStartDate, weekEndDate } = getWeekBounds(anchor, timeZone, weekStartDay);
    return {
      period: normalizedPeriod,
      startDate: weekStartDate,
      endDate: weekEndDate,
      weekStartDay: getWeekStartDay(),
      timeZone,
    };
  }

  if (normalizedPeriod === 'bi_weekly') {
    const { startDate: biStart, endDate: biEnd } = buildBiWeeklyBounds(anchor, timeZone, weekStartDay);
    return {
      period: normalizedPeriod,
      startDate: biStart,
      endDate: biEnd,
      weekStartDay: getWeekStartDay(),
      timeZone,
    };
  }

  if (normalizedPeriod === 'monthly') {
    const monthInput = parseDateInput(startDate) || anchor;
    const { monthStart, monthEnd } = getMonthBounds(monthInput, timeZone);
    return {
      period: normalizedPeriod,
      startDate: monthStart,
      endDate: monthEnd,
      weekStartDay: getWeekStartDay(),
      timeZone,
    };
  }

  const rangeStart = parseDateInput(startDate);
  const rangeEnd = parseDateInput(endDate);

  if (!rangeStart || !rangeEnd) {
    throw new AppError('Custom report period requires startDate and endDate', {
      status: 400,
      code: reportErrorCodes.REPORT_INVALID_DATE_RANGE,
      details: { period: normalizedPeriod },
    });
  }

  if (rangeStart.getTime() > rangeEnd.getTime()) {
    throw new AppError('Report startDate must be before or equal to endDate', {
      status: 400,
      code: reportErrorCodes.REPORT_INVALID_DATE_RANGE,
      details: { startDate, endDate },
    });
  }

  const endOfDay = new Date(rangeEnd);
  endOfDay.setUTCHours(23, 59, 59, 999);

  return {
    period: normalizedPeriod,
    startDate: rangeStart,
    endDate: endOfDay,
    weekStartDay: getWeekStartDay(),
    timeZone,
  };
}

module.exports = {
  buildDateRange,
};
