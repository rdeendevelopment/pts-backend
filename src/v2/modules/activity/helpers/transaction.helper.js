const { getV2Connection } = require('../../../database/connection');

async function withOptionalTransaction(work) {
  let session = null;
  try {
    // v2 models (activity, projects) use mongoose.createConnection — not the default client.
    session = await getV2Connection().startSession();
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    if (session) {
      await session.abortTransaction().catch(() => {});
    }

    // Standalone Mongo (no replica set) cannot use transactions — retry without session.
    if (
      err.message?.includes('Transaction numbers are only allowed')
      || err.codeName === 'IllegalOperation'
    ) {
      return work(null);
    }
    throw err;
  } finally {
    if (session) session.endSession();
  }
}

function groupEntriesForConsumption(entries = []) {
  const assignmentTotals = new Map();
  const budgetTotals = new Map();
  const projectIds = new Set();

  for (const entry of entries) {
    const minutes = Number(entry.minutes || 0);
    if (minutes <= 0) continue;

    if (entry.assignmentId) {
      const assignmentKey = String(entry.assignmentId);
      assignmentTotals.set(assignmentKey, (assignmentTotals.get(assignmentKey) || 0) + minutes);
    }

    if (entry.budgetId) {
      const budgetKey = String(entry.budgetId);
      budgetTotals.set(budgetKey, (budgetTotals.get(budgetKey) || 0) + minutes);
    }

    projectIds.add(String(entry.projectId));
  }

  return { assignmentTotals, budgetTotals, projectIds };
}

module.exports = {
  withOptionalTransaction,
  groupEntriesForConsumption,
};
