async function ensureReportModuleIndexes() {
  const { getTimeEntryModel } = require('../../activity/models/timeEntry.model');
  const TimeEntry = getTimeEntryModel();

  await TimeEntry.collection.createIndex(
    { userId: 1, entryDate: 1, status: 1, isDeleted: 1 },
    { name: 'pts_time_entries_report_user_date_status' }
  );
  await TimeEntry.collection.createIndex(
    { projectId: 1, entryDate: 1, status: 1, isDeleted: 1 },
    { name: 'pts_time_entries_report_project_date_status' }
  );
}

module.exports = {
  ensureReportModuleIndexes,
};
