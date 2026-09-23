const DAY_MS = 86400000;
const { formatDayKey, getBusinessTimezone, getWeekStartDay } = require('../../activity/helpers/week.helper');

function dayNumber(dayKey) {
  const [year, month, day] = String(dayKey).split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function daysBetween(fromDay, toDay) {
  if (!fromDay || !toDay) return 0;
  return Math.max(0, Math.round(dayNumber(toDay) - dayNumber(fromDay)));
}

function dateKey(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatDayKey(date, getBusinessTimezone());
}

function latestCompletionDate(todo) {
  return dateKey(todo.completedAt)
    || dateKey([...(todo.completionEvents || [])].reverse().find((event) => !event.reopenedAt)?.completedAt);
}

function planningEntries(todo) {
  if (Array.isArray(todo.planningHistory) && todo.planningHistory.length) return todo.planningHistory;
  const plannedDate = todo.currentPlannedDate || todo.todoDate || todo.firstPlannedDate;
  if (!plannedDate) return [];
  const completedDay = dateKey(todo.completedAt);
  const completedThisDay = todo.status === 'completed' && completedDay === plannedDate;
  return [{
    plannedDate,
    addedAt: todo.createdAt || null,
    source: todo.linkedTaskId ? 'added_from_task' : 'created',
    statusAtDayEnd: completedThisDay ? 'completed' : 'pending',
    completedAt: completedThisDay ? todo.completedAt : null,
  }];
}

function entryForDay(todo, dayKey) {
  return planningEntries(todo).find((entry) => entry.plannedDate === dayKey) || null;
}

function outcomeForDay(todo, dayKey) {
  const entry = entryForDay(todo, dayKey);
  if (!entry) return null;
  const completedDay = dateKey(entry.completedAt);
  const finalCompletedDay = latestCompletionDate(todo);
  return {
    plannedDate: dayKey,
    statusAtDayEnd: entry.statusAtDayEnd,
    completedThisDay: entry.statusAtDayEnd === 'completed' && completedDay === dayKey,
    movedToDate: entry.movedToDate || null,
    laterCompletedDate: finalCompletedDay && finalCompletedDay > dayKey ? finalCompletedDay : null,
  };
}

function isOutstandingOnDate(todo, dayKey) {
  const firstPlannedDate = todo.firstPlannedDate || planningEntries(todo)[0]?.plannedDate;
  if (!firstPlannedDate || firstPlannedDate >= dayKey) return false;
  if (planningEntries(todo).some((entry) => entry.plannedDate === dayKey)) return false;
  const actions = [];
  for (const event of todo.completionEvents || []) {
    if (event.completedAt) actions.push({ at: new Date(event.completedAt), status: 'completed' });
    if (event.reopenedAt) actions.push({ at: new Date(event.reopenedAt), status: 'pending' });
  }
  if (!actions.length && todo.completedAt) actions.push({ at: new Date(todo.completedAt), status: 'completed' });
  actions.sort((a, b) => a.at.getTime() - b.at.getTime());
  let status = 'pending';
  for (const action of actions) {
    if (dateKey(action.at) <= dayKey) status = action.status;
  }
  return status === 'pending';
}

function buildReport(items, startDate, endDate) {
  const inRange = (day) => day >= startDate && day <= endDate;
  const entries = items.flatMap((todo) => planningEntries(todo)
    .filter((entry) => inRange(entry.plannedDate))
    .map((entry) => ({ todo, entry })));
  const completedWithinSameDay = entries.filter(({ entry }) => (
    entry.statusAtDayEnd === 'completed' && dateKey(entry.completedAt) === entry.plannedDate
  )).length;
  const pendingAtDayEnd = entries.length - completedWithinSameDay;
  const carriedIntoPeriod = entries.filter(({ entry }) => (
    entry.source === 'carried_forward' && entry.carriedFromDate && entry.carriedFromDate < startDate
  )).length;
  const carriedOutOfPeriod = entries.filter(({ entry }) => entry.movedToDate && entry.movedToDate > endDate).length;
  const completedAfterBeingCarried = items.filter((todo) => {
    if (!(todo.carryForwardCount > 0)) return false;
    return (todo.completionEvents || []).some((event) => !event.reopenedAt && inRange(dateKey(event.completedAt) || ''));
  }).length;
  const completionDays = items.flatMap((todo) => (todo.completionEvents || [])
    .filter((event) => !event.reopenedAt && inRange(dateKey(event.completedAt) || ''))
    .map((event) => daysBetween(todo.firstPlannedDate, dateKey(event.completedAt))));
  const mostCarriedIncompleteItems = items.filter((todo) => todo.status === 'pending' && todo.carryForwardCount > 0)
    .sort((a, b) => b.carryForwardCount - a.carryForwardCount)
    .slice(0, 10)
    .map((todo) => ({ id: String(todo._id), title: todo.title, carryForwardCount: todo.carryForwardCount, firstPlannedDate: todo.firstPlannedDate, currentPlannedDate: todo.currentPlannedDate }));
  const currentlyPending = items.filter((todo) => todo.status === 'pending').length;
  const completedLateItems = items.filter((todo) => {
    const completedDay = latestCompletionDate(todo);
    return todo.status === 'completed' && completedDay && daysBetween(todo.firstPlannedDate, completedDay) > 0;
  }).map((todo) => ({
    id: String(todo._id), title: todo.title,
    completedAt: todo.completedAt,
    completedLateDays: daysBetween(todo.firstPlannedDate, latestCompletionDate(todo)),
    firstPlannedDate: todo.firstPlannedDate,
  }));
  return {
    period: { startDate, endDate },
    totalPlanned: entries.length,
    completedWithinSameDay,
    pendingAtDayEnd,
    currentlyPending,
    completedLate: completedLateItems.length,
    completedLateItems,
    carriedIntoPeriod,
    carriedOutOfPeriod,
    completedAfterBeingCarried,
    completionPercentage: entries.length ? Math.round((completedWithinSameDay / entries.length) * 100) : 0,
    averageDaysToCompletion: completionDays.length ? Number((completionDays.reduce((sum, days) => sum + days, 0) / completionDays.length).toFixed(2)) : 0,
    mostCarriedIncompleteItems,
  };
}

function reportRange(period, anchorDate) {
  const [year, month, day] = anchorDate.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  let start = new Date(anchor);
  let end = new Date(anchor);
  if (period === 'weekly') {
    const weekStart = getWeekStartDay() === 'sunday' ? 0 : 1;
    const offset = (anchor.getUTCDay() - weekStart + 7) % 7;
    start.setUTCDate(anchor.getUTCDate() - offset);
    end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  } else if (period === 'monthly') {
    start = new Date(Date.UTC(year, month - 1, 1));
    end = new Date(Date.UTC(year, month, 0));
  }
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

module.exports = { daysBetween, planningEntries, entryForDay, outcomeForDay, isOutstandingOnDate, buildReport, reportRange, dateKey, latestCompletionDate };
