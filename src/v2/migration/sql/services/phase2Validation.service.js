const { Types } = require('mongoose');
const { getTimeEntryModel } = require('../../../modules/activity/models/timeEntry.model');
const { getTimeWeekModel } = require('../../../modules/activity/models/timeWeek.model');
const { getActiveTimerModel } = require('../../../modules/activity/models/activeTimer.model');
const timeEntryRepository = require('../../../modules/activity/repositories/timeEntry.repository');

function isObjectId(value) {
  return Types.ObjectId.isValid(String(value));
}

async function validateSqlPhase2Import(connection, runId, { dryRun = true } = {}) {
  const issues = [];

  const numericLegacyFields = await getTimeEntryModel().countDocuments({
    $or: [
      { legacyId: { $exists: true } },
      { sourceId: { $exists: true } },
      { mysqlId: { $exists: true } },
    ],
  });
  if (numericLegacyFields > 0) {
    issues.push('pts_time_entries contains forbidden legacy id fields');
  }

  const orphanEntries = await getTimeEntryModel().aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: 'pts_time_weeks',
        localField: 'timeWeekId',
        foreignField: '_id',
        as: 'week',
      },
    },
    { $match: { week: { $size: 0 } } },
    { $count: 'count' },
  ]);
  if (orphanEntries[0]?.count) {
    issues.push(`Found ${orphanEntries[0].count} time entries without a time week`);
  }

  const orphanProjectEntries = await getTimeEntryModel().aggregate([
    { $match: { isDeleted: false } },
    {
      $lookup: {
        from: 'pts_projects',
        localField: 'projectId',
        foreignField: '_id',
        as: 'project',
      },
    },
    { $match: { project: { $size: 0 } } },
    { $count: 'count' },
  ]);
  if (orphanProjectEntries[0]?.count) {
    issues.push(`Found ${orphanProjectEntries[0].count} time entries without a project`);
  }

  const activeTimers = await getActiveTimerModel().countDocuments({ status: 'running' });
  if (activeTimers > 0) {
    issues.push(`Found ${activeTimers} active timers (migration should not create timers)`);
  }

  if (runId && !dryRun) {
    const weeks = await getTimeWeekModel().find({ isDeleted: false }).limit(500).lean();
    for (const week of weeks) {
      const totals = await timeEntryRepository.sumMinutesByWeek(week._id, {
        statuses: ['draft', 'submitted', 'approved'],
      });
      if (week.totalMinutes !== totals.totalMinutes || week.totalEntries !== totals.totalEntries) {
        issues.push(`Week ${week._id} totals mismatch entries (${week.totalMinutes} vs ${totals.totalMinutes} min)`);
        break;
      }
    }

    const badIds = await getTimeEntryModel().countDocuments({
      $or: [
        { userId: { $type: 'number' } },
        { projectId: { $type: 'number' } },
        { workCategoryId: { $type: 'number' } },
      ],
    });
    if (badIds > 0) issues.push('Time entries contain numeric reference ids');
  }

  return { ok: issues.length === 0, issues };
}

module.exports = {
  validateSqlPhase2Import,
};
