const { WORKFLOW_ORDER_STEP } = require('../constants/tasks.constants');

function slugifyStatusKey(name, { fallback = 'status' } = {}) {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

function assertReorderUpdates(updates = [], validStatusIds = []) {
  if (!Array.isArray(updates) || !updates.length) {
    throw new Error('updates must be a non-empty array');
  }

  const validIds = new Set(validStatusIds.map(String));

  for (const row of updates) {
    const statusId = row?.statusId != null ? String(row.statusId) : '';
    const order = Number(row?.order);
    if (!statusId || !validIds.has(statusId)) {
      throw new Error('Invalid status in reorder payload');
    }
    if (!Number.isFinite(order)) {
      throw new Error('Invalid order in reorder payload');
    }
  }

  return updates.map((row) => ({
    statusId: String(row.statusId),
    order: Number(row.order),
  }));
}

function assertArchiveAllowed({
  activeStatusCount,
  taskCountInStatus,
  replacementStatusId,
}) {
  if (activeStatusCount <= 1) {
    throw new Error('Cannot archive the last active workflow status');
  }

  if (taskCountInStatus > 0 && !replacementStatusId) {
    throw new Error('replacementStatusId is required when tasks exist in this status');
  }
}

function nextStatusOrder(activeStatuses = []) {
  if (!activeStatuses.length) return WORKFLOW_ORDER_STEP;
  const maxOrder = Math.max(...activeStatuses.map((row) => Number(row.order) || 0));
  return maxOrder + WORKFLOW_ORDER_STEP;
}

module.exports = {
  slugifyStatusKey,
  assertReorderUpdates,
  assertArchiveAllowed,
  nextStatusOrder,
};
