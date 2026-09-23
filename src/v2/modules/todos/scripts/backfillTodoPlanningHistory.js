const { connectV2Database, closeV2Database } = require('../../../database/connection');
const { getTodoModel } = require('../models/todo.model');
const { formatDayKey, getBusinessTimezone } = require('../../activity/helpers/week.helper');

function reliableDate(todo) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(todo.firstPlannedDate || ''))) return todo.firstPlannedDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(todo.currentPlannedDate || ''))) return todo.currentPlannedDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(todo.todoDate || ''))) return todo.todoDate;
  return formatDayKey(todo.createdAt || new Date(), getBusinessTimezone());
}

function buildBackfillUpdate(todo) {
  if (Array.isArray(todo.planningHistory) && todo.planningHistory.length
    && todo.firstPlannedDate && todo.currentPlannedDate && todo.sourceType) return null;
  const plannedDate = reliableDate(todo);
  const completedAt = todo.completedAt ? new Date(todo.completedAt) : null;
  const completedDay = completedAt ? formatDayKey(completedAt, getBusinessTimezone()) : null;
  const statusAtDayEnd = todo.status === 'completed' && completedDay === plannedDate ? 'completed' : 'pending';
  const sourceType = todo.linkedTaskId ? 'task' : 'personal';
  const update = {
    firstPlannedDate: todo.firstPlannedDate || plannedDate,
    currentPlannedDate: todo.currentPlannedDate || todo.todoDate || plannedDate,
    todoDate: todo.todoDate || plannedDate,
    sourceType,
    carryForwardCount: Number(todo.carryForwardCount || 0),
  };
  if (!Array.isArray(todo.planningHistory) || !todo.planningHistory.length) {
    update.planningHistory = [{
      plannedDate, addedAt: todo.createdAt || new Date(),
      source: sourceType === 'task' ? 'added_from_task' : 'created',
      statusAtDayEnd, completedAt: statusAtDayEnd === 'completed' ? completedAt : null,
    }];
  }
  if ((!Array.isArray(todo.completionEvents) || !todo.completionEvents.length) && completedAt && todo.completedBy) {
    update.completionEvents = [{ completedAt, completedBy: todo.completedBy, plannedDate }];
  }
  return update;
}

async function run({ apply = false, batchSize = 500 } = {}) {
  const Todo = getTodoModel();
  const query = { $or: [
    { planningHistory: { $exists: false } }, { planningHistory: { $size: 0 } },
    { firstPlannedDate: { $exists: false } }, { currentPlannedDate: { $exists: false } },
    { sourceType: { $exists: false } },
  ] };
  const counts = { processed: 0, updated: 0, skipped: 0, failed: 0 };
  let lastId = null;
  while (true) {
    const pageQuery = lastId ? { $and: [query, { _id: { $gt: lastId } }] } : query;
    const rows = await Todo.find(pageQuery).sort({ _id: 1 }).limit(batchSize).lean();
    if (!rows.length) break;
    const operations = [];
    for (const row of rows) {
      counts.processed += 1;
      try {
        const update = buildBackfillUpdate(row);
        if (!update) counts.skipped += 1;
        else operations.push({ updateOne: { filter: { _id: row._id, $or: query.$or }, update: { $set: update } } });
      } catch (error) {
        counts.failed += 1;
        console.error('[todo-history-backfill] failed', { id: String(row._id), message: error.message });
      }
    }
    if (apply && operations.length) {
      const result = await Todo.bulkWrite(operations, { ordered: false });
      counts.updated += result.modifiedCount;
      counts.skipped += operations.length - result.modifiedCount;
    } else counts.updated += operations.length;
    lastId = rows[rows.length - 1]._id;
    console.info('[todo-history-backfill] progress', counts);
  }
  console.info('[todo-history-backfill] complete', { mode: apply ? 'apply' : 'dry-run', ...counts });
  return counts;
}

if (require.main === module) {
  connectV2Database()
    .then(() => run({ apply: process.argv.includes('--apply') }))
    .then(() => closeV2Database())
    .catch(async (error) => { console.error(error); await closeV2Database(); process.exitCode = 1; });
}

module.exports = { reliableDate, buildBackfillUpdate, run };
