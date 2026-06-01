const { prepareMigrationContext, completeMigrationRun } = require('../helpers/migrationBase.helper');
const { writeMigrationReport } = require('../helpers/reportWriter.helper');
const { createMigrationRun } = require('./migrationRun.service');
const { migrateUsers } = require('./userMigration.service');
const { migrateClients } = require('./clientMigration.service');
const { migrateProjects } = require('./projectMigration.service');
const { migrateActivity } = require('./activityMigration.service');
const { migrateTasks } = require('./taskMigration.service');
const { migrateAttachments } = require('./attachmentMigration.service');
const { recalculateAllProjectBudgets } = require('./projectRecalculate.service');

const STEPS = [
  { name: 'users', fn: migrateUsers, reportKey: 'users' },
  { name: 'clients', fn: migrateClients, reportKey: 'clients' },
  { name: 'projects', fn: migrateProjects, reportKey: 'projects' },
  { name: 'activity', fn: migrateActivity, reportKey: 'activity' },
  { name: 'tasks', fn: migrateTasks, reportKey: 'tasks' },
  { name: 'attachments', fn: migrateAttachments, reportKey: 'attachments' },
  { name: 'recalculate', fn: recalculateAllProjectBudgets, reportKey: 'recalculate-budgets' },
];

async function migrateAll({
  mode = 'live',
  batchSize = 500,
  startedBy = 'migrateAll',
  notes = null,
  steps = null,
} = {}) {
  const selectedSteps = steps
    ? STEPS.filter((step) => steps.includes(step.name))
    : STEPS;

  if (!selectedSteps.length) {
    throw new Error('No migration steps selected.');
  }

  const dryRun = mode === 'dry-run';
  const ctx = await prepareMigrationContext({
    mode,
    batchSize,
    startedBy,
    notes: notes || `Full migration (${mode})`,
  });

  let run = ctx.run;
  if (!dryRun) {
    run = await createMigrationRun(ctx.targetConnection, {
      mode,
      startedBy,
      notes: notes || `Full migration (${mode})`,
      options: { batchSize },
    });
  }

  const results = [];
  const runSteps = [];

  for (const step of selectedSteps) {
    const stepResult = await step.fn({
      mode,
      batchSize,
      startedBy: step.name,
      runId: String(run._id),
      skipRunComplete: true,
      notes: `${step.name} migration (${mode})`,
    });

    results.push({ step: step.name, ...stepResult });
    runSteps.push({
      entityType: step.name,
      status: stepResult.stats?.errorCount ? 'completed_with_errors' : 'completed',
      finishedAt: new Date(),
      sourceCount: summarizeSourceCount(stepResult.stats),
      insertedCount: summarizeInsertedCount(stepResult.stats),
      skippedCount: stepResult.stats?.skippedCount || 0,
      errorCount: stepResult.stats?.errorCount || 0,
    });
  }

  const summary = {
    runId: String(run._id),
    mode,
    batchSize,
    completedAt: new Date().toISOString(),
    steps: results.map((row) => ({
      step: row.step,
      ok: row.ok,
      errorCount: row.stats?.errorCount || 0,
      reportPath: row.reportPath,
    })),
    totalErrors: results.reduce((sum, row) => sum + (row.stats?.errorCount || 0), 0),
  };

  const summaryPath = await writeMigrationReport(run._id, 'summary', summary);

  if (!dryRun) {
    await completeMigrationRun(ctx.targetConnection, run._id, {
      status: summary.totalErrors ? 'completed_with_errors' : 'completed',
      steps: runSteps,
    });
  }

  return { ok: summary.totalErrors === 0, runId: String(run._id), summaryPath, summary, results };
}

function summarizeSourceCount(stats = {}) {
  return stats.sourceCount
    || stats.sourceProjectCount
    || stats.sourceWeekCount
    || stats.sourceTaskCount
    || stats.projectAttachmentCount
    || stats.projectCount
    || 0;
}

function summarizeInsertedCount(stats = {}) {
  return stats.mappedCount
    || stats.mappedProjectCount
    || stats.mappedEntryCount
    || stats.mappedTaskCount
    || stats.recalculatedProjectCount
    || 0;
}

module.exports = {
  migrateAll,
  STEPS,
};
