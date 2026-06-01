const { ensureTimeWeekIndexes } = require('./timeWeek.model');
const { ensureTimeEntryIndexes } = require('./timeEntry.model');
const { ensureActiveTimerIndexes } = require('./activeTimer.model');
const { ensureWorkCategoryIndexes } = require('./workCategory.model');

async function ensureActivityModuleIndexes() {
  await ensureTimeWeekIndexes();
  await ensureTimeEntryIndexes();
  await ensureActiveTimerIndexes();
  await ensureWorkCategoryIndexes();
}

module.exports = {
  ensureActivityModuleIndexes,
  ensureTimeWeekIndexes,
  ensureTimeEntryIndexes,
  ensureActiveTimerIndexes,
  ensureWorkCategoryIndexes,
};
