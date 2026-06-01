const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function clampRenewalDay(value) {
  const day = Number(value || 1);
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, Math.round(day)));
}

function normalizeUtcDay(date) {
  const ref = new Date(date);
  return new Date(Date.UTC(
    ref.getUTCFullYear(),
    ref.getUTCMonth(),
    ref.getUTCDate(),
    0, 0, 0, 0,
  ));
}

function addUtcMonths(date, months) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    date.getUTCDate(),
    0, 0, 0, 0,
  ));
}

/**
 * Retainer cycle: starts on renewalDay each month (1–28), ends the instant before the next cycle starts.
 */
function getRetainerPeriodBounds(referenceDate, renewalDayInput) {
  const renewalDay = clampRenewalDay(renewalDayInput);
  const ref = normalizeUtcDay(referenceDate);
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const d = ref.getUTCDate();

  let periodStart;
  if (d >= renewalDay) {
    periodStart = new Date(Date.UTC(y, m, renewalDay, 0, 0, 0, 0));
  } else {
    periodStart = new Date(Date.UTC(y, m - 1, renewalDay, 0, 0, 0, 0));
  }

  const nextStart = addUtcMonths(periodStart, 1);
  const periodEnd = new Date(nextStart.getTime() - 1);

  return { periodStart, periodEnd, renewalDay };
}

function getNextRetainerPeriod(currentPeriodStart, renewalDayInput) {
  const renewalDay = clampRenewalDay(renewalDayInput);
  const periodStart = addUtcMonths(normalizeUtcDay(currentPeriodStart), 1);
  const nextStart = addUtcMonths(periodStart, 1);
  const periodEnd = new Date(nextStart.getTime() - 1);
  return { periodStart, periodEnd, renewalDay };
}

function isDateInPeriod(referenceDate, periodStart, periodEnd) {
  if (!periodStart || !periodEnd) return false;
  const t = new Date(referenceDate).getTime();
  return t >= new Date(periodStart).getTime() && t <= new Date(periodEnd).getTime();
}

function formatRetainerPeriodLabel(periodStart, periodEnd) {
  if (!periodStart || !periodEnd) return null;
  const start = normalizeUtcDay(periodStart);
  const end = normalizeUtcDay(periodEnd);
  const startLabel = `${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCDate()}, ${start.getUTCFullYear()}`;
  const endLabel = `${MONTH_NAMES[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  if (startLabel === endLabel) return startLabel;
  return `${startLabel} – ${endLabel}`;
}

function isRetainerCycleEntry(budget = {}) {
  const entryType = String(budget.entryType || budget.sourceType || '').trim();
  return entryType === 'retainer_cycle'
    || entryType === 'retainer_month'
    || entryType === 'retainer_renewal';
}

function budgetCountsForRetainerCapacity(budget, referenceDate, renewalDay) {
  if (budget.isDeleted) return false;

  if (isRetainerCycleEntry(budget)) {
    if (budget.periodStart && budget.periodEnd) {
      return isDateInPeriod(referenceDate, budget.periodStart, budget.periodEnd);
    }
    return false;
  }

  if (budget.entryType === 'initial' || budget.sourceType === 'initial') {
    return false;
  }

  return true;
}

function enrichRetainerBudgetDto(budget, project, referenceDate = new Date()) {
  if (!budget || !project || project.type !== 'retainer') {
    return {
      isCurrentPeriod: null,
      periodLabel: null,
    };
  }

  const renewalDay = clampRenewalDay(project.retainerRenewalDay);
  const currentPeriod = getRetainerPeriodBounds(referenceDate, renewalDay);
  const doc = budget.toObject ? budget.toObject() : budget;
  const periodLabel = formatRetainerPeriodLabel(doc.periodStart, doc.periodEnd);
  const isCycle = isRetainerCycleEntry(doc);
  const isCurrentPeriod = isCycle && doc.periodStart
    ? new Date(doc.periodStart).getTime() === new Date(currentPeriod.periodStart).getTime()
    : false;

  return { isCurrentPeriod, periodLabel };
}

module.exports = {
  clampRenewalDay,
  normalizeUtcDay,
  getRetainerPeriodBounds,
  getNextRetainerPeriod,
  isDateInPeriod,
  formatRetainerPeriodLabel,
  isRetainerCycleEntry,
  budgetCountsForRetainerCapacity,
  enrichRetainerBudgetDto,
};
