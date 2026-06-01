const { calculateRemainingMinutes } = require('../../modules/projects/helpers/assignment.helper');
const projectStatsService = require('../../modules/projects/services/projectStats.service');
const projectBudgetRepository = require('../../modules/projects/repositories/projectBudget.repository');
const projectAssignmentRepository = require('../../modules/projects/repositories/projectAssignment.repository');
const { getProjectModel } = require('../../modules/projects/models/project.model');
const { getTimeEntryModel } = require('../../modules/activity/models/timeEntry.model');
const { getProjectBudgetModel } = require('../../modules/projects/models/projectBudget.model');
const {
  prepareMigrationContext,
  finalizeMigrationStep,
  completeMigrationRun,
} = require('../helpers/migrationBase.helper');

const CONSUMPTION_STATUSES = ['draft', 'submitted', 'approved'];

function createEmptyStats() {
  return {
    projectCount: 0,
    recalculatedProjectCount: 0,
    updatedBudgetCount: 0,
    updatedAssignmentCount: 0,
    totalEntryMinutes: 0,
    errorCount: 0,
  };
}

async function aggregateEntryMinutesByProject(projectId) {
  const TimeEntry = getTimeEntryModel();
  const entries = await TimeEntry.find({
    projectId,
    isDeleted: false,
    status: { $in: CONSUMPTION_STATUSES },
  }).select('minutes assignmentId budgetId').lean();

  const assignmentTotals = new Map();
  const budgetTotals = new Map();
  let totalEntryMinutes = 0;

  for (const entry of entries) {
    const minutes = Number(entry.minutes || 0);
    if (minutes <= 0) continue;

    totalEntryMinutes += minutes;

    if (entry.assignmentId) {
      const key = String(entry.assignmentId);
      assignmentTotals.set(key, (assignmentTotals.get(key) || 0) + minutes);
    }

    if (entry.budgetId) {
      const key = String(entry.budgetId);
      budgetTotals.set(key, (budgetTotals.get(key) || 0) + minutes);
    }
  }

  return { assignmentTotals, budgetTotals, totalEntryMinutes, entryCount: entries.length };
}

async function recalculateProjectBudgets(projectId, { dryRun = false } = {}) {
  const { assignmentTotals, budgetTotals, totalEntryMinutes } = await aggregateEntryMinutesByProject(projectId);

  let updatedBudgetCount = 0;
  let updatedAssignmentCount = 0;

  const budgets = await projectBudgetRepository.listByProjectId(projectId);
  for (const budget of budgets) {
    const consumedMinutes = budgetTotals.get(String(budget._id)) || 0;
    if (Number(budget.consumedMinutes || 0) === consumedMinutes) continue;

    if (!dryRun) {
      await projectBudgetRepository.updateBudget(budget._id, projectId, { consumedMinutes });
    }
    updatedBudgetCount += 1;
  }

  const assignments = await projectAssignmentRepository.listByProjectId(projectId, { status: 'active' });
  for (const assignment of assignments) {
    const consumedMinutes = assignmentTotals.get(String(assignment._id)) || 0;
    const remainingMinutes = calculateRemainingMinutes(
      assignment.allocation?.allocatedMinutes,
      consumedMinutes
    );

    if (
      Number(assignment.stats?.consumedMinutes || 0) === consumedMinutes
      && Number(assignment.stats?.remainingMinutes || 0) === remainingMinutes
    ) {
      continue;
    }

    if (!dryRun) {
      await projectAssignmentRepository.updateAssignment(assignment._id, projectId, {
        stats: { consumedMinutes, remainingMinutes },
      });
    }
    updatedAssignmentCount += 1;
  }

  if (!dryRun) {
    await projectStatsService.recalculateStats(projectId);
  }

  return {
    updatedBudgetCount,
    updatedAssignmentCount,
    totalEntryMinutes,
  };
}

async function recalculateAllProjectBudgets(options = {}) {
  const ctx = await prepareMigrationContext({
    mode: options.mode || 'dry-run',
    batchSize: options.batchSize || 500,
    startedBy: options.startedBy || 'recalculateProjectBudgets',
    notes: options.notes || 'Recalculate project budgets and stats from migrated time entries',
    runId: options.runId || null,
  });

  const stats = createEmptyStats();
  const Project = getProjectModel();
  const projects = await Project.find({ isDeleted: false }).select('_id').lean();
  stats.projectCount = projects.length;

  for (const project of projects) {
    try {
      const result = await recalculateProjectBudgets(project._id, { dryRun: ctx.dryRun });
      stats.recalculatedProjectCount += 1;
      stats.updatedBudgetCount += result.updatedBudgetCount;
      stats.updatedAssignmentCount += result.updatedAssignmentCount;
      stats.totalEntryMinutes += result.totalEntryMinutes;
    } catch (err) {
      stats.errorCount += 1;
    }
  }

  const budgetSummary = await getProjectBudgetModel().aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: null,
        totalApprovedMinutes: { $sum: '$approvedMinutes' },
        totalConsumedMinutes: { $sum: '$consumedMinutes' },
      },
    },
  ]);

  stats.budgetTotals = budgetSummary[0] || {
    totalApprovedMinutes: 0,
    totalConsumedMinutes: 0,
  };

  const { report, reportPath } = await finalizeMigrationStep(
    ctx.targetConnection,
    ctx.run,
    'recalculate-budgets',
    stats,
    ctx
  );

  if (!ctx.dryRun && !options.skipRunComplete) {
    await completeMigrationRun(ctx.targetConnection, ctx.run._id, {
      status: stats.errorCount ? 'completed_with_errors' : 'completed',
      steps: [{
        entityType: 'recalculate_budgets',
        status: stats.errorCount ? 'completed_with_errors' : 'completed',
        finishedAt: new Date(),
        sourceCount: stats.projectCount,
        insertedCount: stats.recalculatedProjectCount,
        skippedCount: 0,
        errorCount: stats.errorCount,
        metadata: {
          updatedBudgetCount: stats.updatedBudgetCount,
          updatedAssignmentCount: stats.updatedAssignmentCount,
          totalEntryMinutes: stats.totalEntryMinutes,
        },
      }],
    });
  }

  return {
    ok: stats.errorCount === 0,
    mode: ctx.mode,
    runId: String(ctx.run._id),
    reportPath,
    stats,
    report,
  };
}

module.exports = {
  recalculateAllProjectBudgets,
  recalculateProjectBudgets,
  createEmptyStats,
};
