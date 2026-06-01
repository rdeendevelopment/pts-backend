const timeEntryRepository = require('../../activity/repositories/timeEntry.repository');
const activeTimerRepository = require('../../activity/repositories/activeTimer.repository');

async function projectHasActiveActivity(projectId) {
  const [entryCount, timerCount] = await Promise.all([
    timeEntryRepository.countActiveEntriesForProject(projectId),
    activeTimerRepository.countRunningForProject(projectId),
  ]);
  return entryCount > 0 || timerCount > 0;
}

module.exports = {
  projectHasActiveActivity,
};
