const timeEntryRepository = require('../../activity/repositories/timeEntry.repository');
const { getDayBounds } = require('../../activity/helpers/week.helper');

async function getActivityMinutesForDay(userId, dayKey, timezone) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const { dayStart, dayEnd } = getDayBounds(anchor, timezone);

  const result = await timeEntryRepository.sumMinutes({
    userId,
    entryDateFrom: dayStart,
    entryDateTo: dayEnd,
    statuses: ['draft', 'submitted', 'approved'],
  });

  return result.totalMinutes || 0;
}

module.exports = {
  getActivityMinutesForDay,
};
