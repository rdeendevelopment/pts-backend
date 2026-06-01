const env = require('../../../config/env');
const { WEEK_START_DAYS } = require('../constants/activity.constants');

const WEEKDAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const WEEK_START_WEEKDAY = {
  sunday: 0,
  monday: 1,
};

function getBusinessTimezone() {
  return env.v2.businessTimezone || 'UTC';
}

function normalizeWeekStartDay(value = env.v2.weekStartDay) {
  const normalized = String(value || 'monday').toLowerCase();
  return WEEK_START_DAYS.includes(normalized) ? normalized : 'monday';
}

function getWeekStartDay() {
  return normalizeWeekStartDay(env.v2.weekStartDay);
}

function getWeekStartWeekday(weekStartDay = getWeekStartDay()) {
  return WEEK_START_WEEKDAY[normalizeWeekStartDay(weekStartDay)];
}

function getZonedParts(date, timeZone = getBusinessTimezone()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  const parts = formatter.formatToParts(date instanceof Date ? date : new Date(date));
  const result = {};
  for (const part of parts) {
    if (part.type !== 'literal') result[part.type] = part.value;
  }
  return result;
}

function zonedDateToUtc(year, month, day, timeZone = getBusinessTimezone()) {
  // Anchor at UTC noon to avoid DST edge ambiguity, then adjust using offset.
  const anchor = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
  const parts = getZonedParts(anchor, timeZone);
  const anchorY = Number(parts.year);
  const anchorM = Number(parts.month);
  const anchorD = Number(parts.day);
  const dayDiff = Number(day) - anchorD;
  const monthDiff = Number(month) - anchorM;
  const yearDiff = Number(year) - anchorY;
  anchor.setUTCDate(anchor.getUTCDate() + dayDiff);
  anchor.setUTCMonth(anchor.getUTCMonth() + monthDiff);
  anchor.setUTCFullYear(anchor.getUTCFullYear() + yearDiff);
  anchor.setUTCHours(0, 0, 0, 0);

  const formatted = getZonedParts(anchor, timeZone);
  if (
    Number(formatted.year) !== Number(year)
    || Number(formatted.month) !== Number(month)
    || Number(formatted.day) !== Number(day)
  ) {
    anchor.setUTCDate(anchor.getUTCDate() + (Number(day) - Number(formatted.day)));
  }
  return anchor;
}

function getWeekBounds(dateInput, timeZone = getBusinessTimezone(), weekStartDay = getWeekStartDay()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const parts = getZonedParts(date, timeZone);
  const weekday = WEEKDAY_MAP[parts.weekday] ?? 0;
  const startWeekday = getWeekStartWeekday(weekStartDay);
  const daysSinceWeekStart = (weekday - startWeekday + 7) % 7;
  const weekStartOffset = -daysSinceWeekStart;

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  const weekStartCalendar = new Date(Date.UTC(year, month - 1, day));
  weekStartCalendar.setUTCDate(weekStartCalendar.getUTCDate() + weekStartOffset);

  const weekStartDate = zonedDateToUtc(
    weekStartCalendar.getUTCFullYear(),
    weekStartCalendar.getUTCMonth() + 1,
    weekStartCalendar.getUTCDate(),
    timeZone
  );

  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  weekEndDate.setUTCHours(23, 59, 59, 999);

  return {
    weekStartDate,
    weekEndDate,
    timezone: timeZone,
    weekStartDay: normalizeWeekStartDay(weekStartDay),
  };
}

function buildWeekDayKeys(weekStartDate, timeZone = getBusinessTimezone()) {
  const keys = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(weekStartDate);
    day.setUTCDate(day.getUTCDate() + offset);
    keys.push(formatDayKey(day, timeZone));
  }

  return keys;
}

function getDayBounds(dateInput, timeZone = getBusinessTimezone()) {
  const parts = getZonedParts(dateInput, timeZone);
  const dayStart = zonedDateToUtc(parts.year, parts.month, parts.day, timeZone);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCHours(23, 59, 59, 999);
  return { dayStart, dayEnd };
}

function getMonthBounds(dateInput, timeZone = getBusinessTimezone()) {
  const parts = getZonedParts(dateInput, timeZone);
  const monthStart = zonedDateToUtc(parts.year, parts.month, 1, timeZone);
  const nextMonth = Number(parts.month) === 12 ? 1 : Number(parts.month) + 1;
  const nextYear = Number(parts.month) === 12 ? Number(parts.year) + 1 : Number(parts.year);
  const nextMonthStart = zonedDateToUtc(nextYear, nextMonth, 1, timeZone);
  const monthEnd = new Date(nextMonthStart.getTime() - 1);
  return { monthStart, monthEnd };
}

function formatDayKey(dateInput, timeZone = getBusinessTimezone()) {
  const parts = getZonedParts(dateInput, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

module.exports = {
  getBusinessTimezone,
  getWeekStartDay,
  normalizeWeekStartDay,
  getWeekBounds,
  buildWeekDayKeys,
  getDayBounds,
  getMonthBounds,
  formatDayKey,
  getZonedParts,
};
