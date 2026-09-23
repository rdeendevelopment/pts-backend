const assert = require('node:assert/strict');
const { connectV2Database, closeV2Database } = require('../../../database/connection');
const { getAccountModel } = require('../../auth/models/account.model');
const { getAccountRoleModel } = require('../../rbac/models/accountRole.model');
const { getTodoModel } = require('../models/todo.model');
const tokenService = require('../../auth/services/token.service');
const { formatDayKey, getBusinessTimezone } = require('../../activity/helpers/week.helper');

const apiBase = process.env.PTS_API_BASE_URL || 'http://127.0.0.1:3001/api/v2';

function shiftedDay(offset) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return formatDayKey(date, getBusinessTimezone());
}

async function request(token, path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body.data;
}

async function run() {
  if (!process.argv.includes('--run')) throw new Error('Pass --run to create and automatically clean up the isolated verification records.');
  const Account = getAccountModel();
  const AccountRole = getAccountRoleModel();
  const Todo = getTodoModel();
  const ownerIds = await Todo.distinct('createdBy', { isDeleted: false });
  let account = null;
  for (const ownerId of ownerIds) {
    const candidate = await Account.findOne({ _id: ownerId, status: 'active', isDeleted: false, accountType: { $ne: 'client' } }).lean();
    const hasExistingRole = candidate && await AccountRole.exists({ accountId: ownerId, status: 'active', isDeleted: false });
    if (candidate && hasExistingRole) {
      account = candidate;
      break;
    }
  }
  assert(account, 'An active existing My Day owner with a pre-existing role is required for the isolated scenario');
  const token = tokenService.signAccessToken(account, []);
  const tag = `__todo_history_verify_${Date.now()}__`;
  const ids = [];
  const day1 = shiftedDay(-2);
  const day2 = shiftedDay(-1);
  const day3 = shiftedDay(0);
  try {
    for (let index = 1; index <= 10; index += 1) {
      const created = await request(token, '/todos', {
        method: 'POST', body: JSON.stringify({ title: `${tag} ${index}`, todoDate: day1, priority: 'medium' }),
      });
      ids.push(created.id);
    }

    const completedAt = new Date(`${day1}T17:00:00.000Z`);
    await Todo.updateMany(
      { _id: { $in: ids.slice(0, 3) } },
      {
        $set: {
          status: 'completed', completedAt, completedBy: account._id,
          'planningHistory.0.statusAtDayEnd': 'completed', 'planningHistory.0.completedAt': completedAt,
        },
        $push: { completionEvents: { completedAt, completedBy: account._id, plannedDate: day1 } },
      }
    );

    const firstDay = await request(token, `/todos?date=${day1}&limit=100`);
    const taggedDay1 = firstDay.items.filter((item) => item.title.startsWith(tag));
    assert.equal(taggedDay1.length, 10);
    assert.equal(taggedDay1.filter((item) => item.status === 'completed').length, 3);
    assert.equal(taggedDay1.filter((item) => item.status === 'pending').length, 7);

    const secondDayOutstanding = await request(token, `/todos/outstanding?date=${day2}&limit=100`);
    const taggedOutstanding = secondDayOutstanding.items.filter((item) => item.title.startsWith(tag));
    assert.equal(taggedOutstanding.length, 7);

    for (const id of ids.slice(3)) await request(token, `/todos/${id}/move-to-today`, { method: 'POST', body: '{}' });
    for (const id of ids.slice(3)) await request(token, `/todos/${id}/move-to-today`, { method: 'POST', body: '{}' });

    const historical = await request(token, `/todos?date=${day1}&limit=100`);
    const current = await request(token, `/todos?date=${day3}&limit=100`);
    const taggedHistorical = historical.items.filter((item) => item.title.startsWith(tag));
    const taggedCurrent = current.items.filter((item) => item.title.startsWith(tag));
    assert.equal(taggedHistorical.length, 10);
    assert.equal(taggedHistorical.filter((item) => item.dayOutcome?.statusAtDayEnd === 'moved_forward').length, 7);
    assert.equal(taggedCurrent.length, 7, 'repeating Bring to Today must not clone records');
    assert(taggedCurrent.every((item) => item.carryForwardCount === 1));

    const completed = await request(token, `/todos/${ids[3]}/complete`, { method: 'PATCH', body: JSON.stringify({ completionMode: 'my_day_only' }) });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.completedLateDays, 2);
    const historyAfterCompletion = await request(token, `/todos?date=${day1}&limit=100`);
    const completedHistory = historyAfterCompletion.items.find((item) => item.id === ids[3]);
    assert.equal(completedHistory?.status, 'pending');
    assert.equal(completedHistory?.currentStatus, 'completed');
    assert.equal(completedHistory?.dayOutcome?.laterCompletedDate, day3);
    assert.equal(completedHistory?.completedLateDays, 2);
    const historicalReport = await request(token, `/todos/reports?period=daily&date=${day1}`);
    assert(historicalReport.completedLateItems.some((item) => item.id === ids[3] && item.completedLateDays === 2));
    const reopened = await request(token, `/todos/${ids[3]}/reopen`, { method: 'PATCH', body: '{}' });
    assert.equal(reopened.status, 'pending');
    const afterReopen = await request(token, `/todos?date=${day3}&limit=100`);
    const reopenedFromList = afterReopen.items.find((item) => item.id === ids[3]);
    assert.equal(reopenedFromList?.status, 'pending', 'reopen must also restore the selected-day historical outcome');

    const legacy = await Todo.collection.insertOne({
      title: `${tag} legacy`, notes: null, status: 'pending', priority: 'medium', priorityRank: 2,
      todoDate: day3, deadline: null, hasDeadline: false, reminderAt: null, projectId: null,
      projectName: '', linkedTaskId: null, createdBy: account._id, completedBy: null,
      completedAt: null, isDeleted: false, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    ids.push(String(legacy.insertedId));
    const legacyCompleted = await request(token, `/todos/${legacy.insertedId}/complete`, { method: 'PATCH', body: JSON.stringify({ completionMode: 'my_day_only' }) });
    assert.equal(legacyCompleted.status, 'completed');
    assert.equal(legacyCompleted.planningHistory.length, 1, 'legacy completion must initialize history atomically');

    const result = {
      days: { day1, day2, day3 }, created: 10, completedOnDay1: 3, outstandingOnDay2: 7,
      broughtToDay3: 7, duplicateBringResultCount: taggedCurrent.length,
      completionAndReopenPassed: true, legacyCompletionPassed: true,
    };
    console.info('[todo-history-verification] passed', result);
    return result;
  } finally {
    if (ids.length) await Todo.deleteMany({ _id: { $in: ids }, title: { $regex: `^${tag}` } });
    console.info('[todo-history-verification] temporary records removed', { count: ids.length });
  }
}

if (require.main === module) {
  connectV2Database()
    .then(run)
    .then(() => closeV2Database())
    .catch(async (error) => { console.error(error); await closeV2Database(); process.exitCode = 1; });
}

module.exports = { shiftedDay, request, run };
