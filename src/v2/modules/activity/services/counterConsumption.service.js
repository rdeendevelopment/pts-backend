const projectsModule = require('../../projects');
const timeEntryRepository = require('../repositories/timeEntry.repository');
const { withOptionalTransaction, groupEntriesForConsumption } = require('../helpers/transaction.helper');

async function applyConsumption(entries, session = null) {
  const { assignmentTotals, budgetTotals, projectIds } = groupEntriesForConsumption(entries);

  for (const [assignmentId, minutes] of assignmentTotals.entries()) {
    await projectsModule.incrementAssignmentConsumedMinutes(assignmentId, minutes, session);
  }

  for (const [budgetId, minutes] of budgetTotals.entries()) {
    await projectsModule.incrementBudgetConsumedMinutes(budgetId, minutes, session);
  }

  for (const projectId of projectIds) {
    await projectsModule.recalculateProjectStats(projectId);
  }
}

async function reverseConsumption(entries, session = null) {
  const { assignmentTotals, budgetTotals, projectIds } = groupEntriesForConsumption(entries);

  for (const [assignmentId, minutes] of assignmentTotals.entries()) {
    await projectsModule.reverseAssignmentConsumedMinutes(assignmentId, minutes, session);
  }

  for (const [budgetId, minutes] of budgetTotals.entries()) {
    await projectsModule.reverseBudgetConsumedMinutes(budgetId, minutes, session);
  }

  for (const projectId of projectIds) {
    await projectsModule.recalculateProjectStats(projectId);
  }
}

async function consumeWeekEntries(weekId, session = null) {
  const entries = await timeEntryRepository.listEntries({
    timeWeekId: weekId,
    statuses: ['draft'],
  });
  await applyConsumption(entries, session);
  return entries;
}

async function reverseWeekEntries(weekId, session = null) {
  const entries = await timeEntryRepository.listEntries({
    timeWeekId: weekId,
    statuses: ['submitted'],
  });
  await reverseConsumption(entries, session);
  return entries;
}

module.exports = {
  applyConsumption,
  reverseConsumption,
  consumeWeekEntries,
  reverseWeekEntries,
  withOptionalTransaction,
};
