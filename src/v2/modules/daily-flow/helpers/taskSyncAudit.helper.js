const { info } = require('../../../kernel/logger');
const aiMemoryRepository = require('../repositories/dailyFlowAiMemory.repository');

const SYNC_EVENTS = [
  'my_day_goal_completed_task_completed',
  'my_day_goal_reopened_task_reopened',
  'task_completed_my_day_goal_completed',
  'task_reopened_my_day_goal_reopened',
];

async function logTaskSyncEvent({
  event,
  accountId,
  userId = null,
  dayKey = null,
  goalId = null,
  taskId = null,
  metadata = {},
}) {
  if (!SYNC_EVENTS.includes(event)) return;

  const payload = {
    accountId,
    userId,
    dayKey,
    goalId: goalId ? String(goalId) : null,
    taskId: taskId ? String(taskId) : null,
    ...metadata,
  };

  info(`Daily Flow task sync audit: ${event}`, payload);

  try {
    await aiMemoryRepository.createMemory({
      accountId,
      userId,
      dayKey,
      type: 'task_sync',
      event,
      inputSnapshot: payload,
      outputText: event,
      fallbackUsed: false,
    });
  } catch (_err) {
    // Audit persistence must not block sync.
  }
}

module.exports = {
  SYNC_EVENTS,
  logTaskSyncEvent,
};
