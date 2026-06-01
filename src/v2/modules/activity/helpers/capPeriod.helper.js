const { CAP_PERIODS } = require('../constants/activity.constants');
const { getWeekBounds, getDayBounds, getMonthBounds } = require('./week.helper');

function getCapPeriodBounds(capPeriod, entryDate, timezone) {
  if (!CAP_PERIODS.includes(capPeriod)) {
    return null;
  }

  if (capPeriod === 'project') {
    return null;
  }
  if (capPeriod === 'day') {
    return getDayBounds(entryDate, timezone);
  }
  if (capPeriod === 'week') {
    return getWeekBounds(entryDate, timezone);
  }
  if (capPeriod === 'month') {
    return getMonthBounds(entryDate, timezone);
  }
  return null;
}

/**
 * Remaining allocation minutes for the assignment cap period.
 * consumedInPeriod includes submitted/approved entries plus draft minutes pending submit.
 */
function calculateCapRemainingMinutes({
  allocatedMinutes,
  consumedInPeriod,
  pendingDraftMinutes = 0,
  requestedMinutes = 0,
  allowExceed = false,
}) {
  const allocated = Math.max(0, Number(allocatedMinutes || 0));
  const consumed = Math.max(0, Number(consumedInPeriod || 0));
  const pending = Math.max(0, Number(pendingDraftMinutes || 0));
  const requested = Math.max(0, Number(requestedMinutes || 0));

  if (allocated === 0 && !allowExceed) {
    return { allowed: allowExceed, remaining: 0, consumed, allocated };
  }

  const projected = consumed + pending + requested;
  const remaining = Math.max(0, allocated - consumed - pending);

  if (allowExceed || projected <= allocated) {
    return { allowed: true, remaining, consumed, allocated, projected };
  }

  return { allowed: false, remaining, consumed, allocated, projected };
}

function calculateBudgetRemainingMinutes(budget, draftMinutes = 0, requestedMinutes = 0) {
  const approved = Number(budget.approvedMinutes || 0);
  const consumed = Number(budget.consumedMinutes || 0);
  const pending = Number(draftMinutes || 0);
  const requested = Number(requestedMinutes || 0);
  return Math.max(0, approved - consumed - pending - requested);
}

module.exports = {
  getCapPeriodBounds,
  calculateCapRemainingMinutes,
  calculateBudgetRemainingMinutes,
};
