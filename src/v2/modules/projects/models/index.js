const { ensureProjectIndexes } = require('./project.model');
const { ensureProjectBudgetIndexes } = require('./projectBudget.model');
const { ensureProjectAssignmentIndexes } = require('./projectAssignment.model');
const { ensureProjectFileIndexes } = require('./projectFile.model');
const { ensureProjectEventIndexes } = require('./projectEvent.model');
const { ensureProjectStatsIndexes } = require('./projectStats.model');

async function ensureProjectModuleIndexes() {
  await ensureProjectIndexes();
  await ensureProjectBudgetIndexes();
  await ensureProjectAssignmentIndexes();
  await ensureProjectFileIndexes();
  await ensureProjectEventIndexes();
  await ensureProjectStatsIndexes();
}

module.exports = {
  ensureProjectModuleIndexes,
  ensureProjectIndexes,
  ensureProjectBudgetIndexes,
  ensureProjectAssignmentIndexes,
  ensureProjectFileIndexes,
  ensureProjectEventIndexes,
  ensureProjectStatsIndexes,
};
