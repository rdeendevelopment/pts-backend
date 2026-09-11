const { getTaskModel } = require('../models/task.model');
const taskNotificationPolicy = require('./taskNotificationPolicy.service');

function dateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function runDueNotifications(now = new Date(), timeZone = 'UTC') {
  const Task = getTaskModel();
  const today = dateKey(now, timeZone);
  // Fetch a bounded horizon, then use the configured timezone below to decide
  // whether each row is due today or overdue. This includes times later today.
  const horizon = new Date(now.getTime() + (24 * 60 * 60 * 1000));
  const tasks = await Task.find({
    isDeleted: false, status: 'active', dueDate: { $ne: null, $lte: horizon },
  }).select('_id projectId title dueDate primaryAssigneeId assignees reviewerId updatedAt').lean();
  const summary = { scanned: tasks.length, dueToday: 0, overdue: 0 };
  for (const task of tasks) {
    const dueKey = dateKey(new Date(task.dueDate), timeZone);
    if (dueKey === today) {
      await taskNotificationPolicy.notifyRecipients(task, null, {
        type: 'task_due_today', message: 'Task is due today', priority: 'high',
        dedupeKey: `${task._id}:due-today:${today}`,
      });
      summary.dueToday += 1;
    } else if (dueKey < today) {
      await taskNotificationPolicy.notifyRecipients(task, null, {
        type: 'task_overdue', message: 'Task is overdue', priority: 'high',
        dedupeKey: `${task._id}:overdue:${new Date(task.dueDate).toISOString()}`,
      });
      summary.overdue += 1;
    }
  }
  return summary;
}

module.exports = { dateKey, runDueNotifications };
