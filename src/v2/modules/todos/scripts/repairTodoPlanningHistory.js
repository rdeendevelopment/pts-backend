const { connectV2Database, closeV2Database } = require('../../../database/connection');
const { getTodoModel } = require('../models/todo.model');
const { formatDayKey, getBusinessTimezone } = require('../../activity/helpers/week.helper');

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayOf(value) {
  return value ? formatDayKey(new Date(value), getBusinessTimezone()) : null;
}

function classifyLegacyTodo(todo) {
  if (Array.isArray(todo.planningHistory) && todo.planningHistory.length) return { kind: 'unchanged', reason: 'history_exists' };
  const currentDate = DAY.test(String(todo.todoDate || '')) ? todo.todoDate : null;
  const createdDate = dayOf(todo.createdAt);
  const updatedDate = dayOf(todo.updatedAt);
  if (!currentDate || !createdDate) return { kind: 'ambiguous', reason: 'missing_reliable_dates' };
  if (createdDate >= currentDate) return { kind: 'ambiguous', reason: 'no_proven_earlier_plan' };
  if (updatedDate !== currentDate) return { kind: 'ambiguous', reason: 'last_change_not_on_destination_day' };
  return { kind: 'direct_move', fromDate: createdDate, toDate: currentDate };
}

function buildDirectMoveRepair(todo, classification = classifyLegacyTodo(todo)) {
  if (classification.kind !== 'direct_move') return null;
  const completedAt = todo.completedAt ? new Date(todo.completedAt) : null;
  const completedOnDestination = completedAt && dayOf(completedAt) === classification.toDate;
  const sourceType = todo.linkedTaskId ? 'task' : 'personal';
  const movedAt = todo.updatedAt || completedAt || new Date(`${classification.toDate}T12:00:00.000Z`);
  return {
    firstPlannedDate: classification.fromDate,
    currentPlannedDate: classification.toDate,
    todoDate: classification.toDate,
    sourceType,
    carryForwardCount: 1,
    planningHistory: [
      {
        plannedDate: classification.fromDate,
        addedAt: todo.createdAt,
        source: sourceType === 'task' ? 'added_from_task' : 'created',
        carriedFromDate: null,
        movedAt,
        movedBy: null,
        movedToDate: classification.toDate,
        statusAtDayEnd: 'moved_forward',
        completedAt: null,
      },
      {
        plannedDate: classification.toDate,
        addedAt: movedAt,
        source: 'carried_forward',
        carriedFromDate: classification.fromDate,
        movedAt: null,
        movedBy: null,
        movedToDate: null,
        statusAtDayEnd: completedOnDestination ? 'completed' : 'pending',
        completedAt: completedOnDestination ? completedAt : null,
      },
    ],
  };
}

async function duplicateCandidates(Todo) {
  return Todo.aggregate([
    { $match: { isDeleted: false } },
    { $group: {
      _id: {
        createdBy: '$createdBy',
        identity: { $ifNull: ['$linkedTaskId', { $concat: [{ $toLower: '$title' }, '|', { $ifNull: ['$projectName', ''] }] }] },
      },
      ids: { $push: '$_id' }, count: { $sum: 1 },
    } },
    { $match: { count: { $gt: 1 } } },
    { $project: { _id: 0, count: 1, ids: 1 } },
  ]);
}

async function run({ apply = false, batchSize = 500 } = {}) {
  const Todo = getTodoModel();
  const query = { $or: [{ planningHistory: { $exists: false } }, { planningHistory: { $size: 0 } }] };
  const counts = { processed: 0, repaired: 0, unchanged: 0, ambiguous: 0, failed: 0, duplicateCandidateGroups: 0 };
  let lastId = null;
  while (true) {
    const pageQuery = lastId ? { $and: [query, { _id: { $gt: lastId } }] } : query;
    const rows = await Todo.find(pageQuery).sort({ _id: 1 }).limit(batchSize).lean();
    if (!rows.length) break;
    for (const row of rows) {
      counts.processed += 1;
      try {
        const classification = classifyLegacyTodo(row);
        if (classification.kind === 'unchanged') { counts.unchanged += 1; continue; }
        if (classification.kind !== 'direct_move') { counts.ambiguous += 1; continue; }
        const update = buildDirectMoveRepair(row, classification);
        if (apply) {
          const result = await Todo.updateOne(
            { _id: row._id, $or: query.$or },
            { $set: update },
            { runValidators: true }
          );
          if (!result.modifiedCount) { counts.unchanged += 1; continue; }
        }
        counts.repaired += 1;
      } catch (error) {
        counts.failed += 1;
        console.error('[todo-history-repair] failed', { id: String(row._id), message: error.message });
      }
    }
    lastId = rows[rows.length - 1]._id;
  }
  const duplicates = await duplicateCandidates(Todo);
  counts.duplicateCandidateGroups = duplicates.length;
  console.info('[todo-history-repair] complete', { mode: apply ? 'apply' : 'dry-run', ...counts });
  if (duplicates.length) console.info('[todo-history-repair] duplicate candidates reported only; no records deleted', duplicates);
  return counts;
}

if (require.main === module) {
  connectV2Database()
    .then(() => run({ apply: process.argv.includes('--apply') }))
    .then(() => closeV2Database())
    .catch(async (error) => { console.error(error); await closeV2Database(); process.exitCode = 1; });
}

module.exports = { dayOf, classifyLegacyTodo, buildDirectMoveRepair, duplicateCandidates, run };
