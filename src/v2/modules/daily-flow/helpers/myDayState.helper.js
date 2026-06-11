const { getBusinessTimezone } = require('../../activity/helpers/week.helper');

const MY_DAY_STATES = ['not_started', 'planned', 'in_progress', 'submitted', 'quiet_day'];
const TIME_OF_DAY = ['morning', 'afternoon', 'evening', 'night'];

function getLocalHour(timezone = getBusinessTimezone(), date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(date instanceof Date ? date : new Date(date));
  const hourPart = parts.find((part) => part.type === 'hour');
  return Number(hourPart?.value ?? 12);
}

function getTimeOfDay(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function timeGreeting(timeOfDay) {
  if (timeOfDay === 'morning') return 'Good morning';
  if (timeOfDay === 'afternoon') return 'Good afternoon';
  if (timeOfDay === 'evening') return 'Good evening';
  return 'Hello';
}

function countTodayItems(goals = [], catchups = []) {
  const activeGoals = goals.filter((g) => g.status !== 'deleted');
  const activeCatchups = catchups.filter((c) => c.status !== 'archived');
  return activeGoals.length + activeCatchups.length;
}

function countCompletedItems(goals = []) {
  return goals.filter((g) => g.status === 'completed').length;
}

function countLinkedTaskItems(goals = []) {
  return goals.filter(
    (g) => g.sourceType === 'task' || g.linkedTaskId || (g.sourceType === 'task' && g.sourceId)
  ).length;
}

function calculateMyDayState({
  endDayReport = null,
  dayRecord = null,
  todayItemsCount = 0,
  completedItemsCount = 0,
  activityMinutes = 0,
  timezone = getBusinessTimezone(),
  now = new Date(),
} = {}) {
  const currentHour = getLocalHour(timezone, now);
  const timeOfDay = getTimeOfDay(currentHour);

  let dayState = 'not_started';

  if (endDayReport || dayRecord?.status === 'submitted') {
    dayState = 'submitted';
  } else if (completedItemsCount > 0 || activityMinutes > 0) {
    dayState = 'in_progress';
  } else if (todayItemsCount > 0) {
    dayState = 'planned';
  } else if (currentHour >= 14) {
    dayState = 'quiet_day';
  }

  const hasExistingPlan = todayItemsCount > 0 && dayState !== 'submitted';
  const shouldCreatePlan = dayState === 'not_started' || dayState === 'quiet_day';
  const shouldResumePlan = dayState === 'planned' || dayState === 'in_progress';
  const shouldShowEndDay = shouldResumePlan && dayState !== 'submitted';

  return {
    dayState,
    timeOfDay,
    currentHour,
    hasExistingPlan,
    shouldCreatePlan,
    shouldResumePlan,
    shouldShowEndDay,
  };
}

function buildFlowMateCacheKey({
  userId,
  dayKey,
  event,
  dayState,
  plannedItemCount,
  completedItemCount,
  timeOfDay,
}) {
  return [
    String(userId),
    dayKey,
    event,
    dayState,
    plannedItemCount,
    completedItemCount,
    timeOfDay,
  ].join('|');
}

const CACHE_REUSE_EVENTS = new Set(['day_opened', 'manual_refresh']);
const CACHE_INVALIDATING_EVENTS = new Set([
  'task_added_to_today',
  'goal_completed',
  'goal_reopened',
  'task_completed',
  'task_reopened',
  'personal_goal_completed',
  'day_submitted',
  'end_day_started',
]);

function shouldReuseFlowMateCache(event) {
  return CACHE_REUSE_EVENTS.has(event);
}

function shouldInvalidateFlowMateCache(event) {
  return CACHE_INVALIDATING_EVENTS.has(event);
}

module.exports = {
  MY_DAY_STATES,
  TIME_OF_DAY,
  getLocalHour,
  getTimeOfDay,
  timeGreeting,
  countTodayItems,
  countCompletedItems,
  countLinkedTaskItems,
  calculateMyDayState,
  buildFlowMateCacheKey,
  shouldReuseFlowMateCache,
  shouldInvalidateFlowMateCache,
};
