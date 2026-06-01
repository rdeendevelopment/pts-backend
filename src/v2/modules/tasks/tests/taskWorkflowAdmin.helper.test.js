const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertReorderUpdates,
  assertArchiveAllowed,
  nextStatusOrder,
  slugifyStatusKey,
} = require('../helpers/taskWorkflowAdmin.helper');

test('slugifyStatusKey normalizes status names', () => {
  assert.equal(slugifyStatusKey('In Progress'), 'in_progress');
});

test('assertReorderUpdates validates payload', () => {
  const updates = assertReorderUpdates(
    [{ statusId: '507f1f77bcf86cd799439011', order: 1024 }],
    ['507f1f77bcf86cd799439011']
  );
  assert.equal(updates.length, 1);
  assert.equal(updates[0].order, 1024);
});

test('assertArchiveAllowed requires replacement when tasks exist', () => {
  assert.throws(
    () => assertArchiveAllowed({ activeStatusCount: 3, taskCountInStatus: 2, replacementStatusId: null }),
    /replacementStatusId is required/
  );
});

test('assertArchiveAllowed blocks archiving last active status', () => {
  assert.throws(
    () => assertArchiveAllowed({ activeStatusCount: 1, taskCountInStatus: 0, replacementStatusId: null }),
    /last active workflow status/
  );
});

test('assertArchiveAllowed permits empty status archive when others remain', () => {
  assert.doesNotThrow(
    () => assertArchiveAllowed({
      activeStatusCount: 3,
      taskCountInStatus: 0,
      replacementStatusId: null,
    })
  );
});

test('nextStatusOrder appends after highest active order', () => {
  assert.equal(
    nextStatusOrder([{ order: 1024 }, { order: 5120 }]),
    6144
  );
});
