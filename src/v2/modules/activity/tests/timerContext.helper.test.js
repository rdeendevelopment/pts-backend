const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toTaskKey,
  buildTimerContextFields,
  contextsMatch,
} = require('../helpers/timerContext.helper');

test('toTaskKey normalizes empty task to NO_TASK', () => {
  assert.equal(toTaskKey(null), 'NO_TASK');
  assert.equal(toTaskKey(''), 'NO_TASK');
  assert.equal(toTaskKey('abc'), 'abc');
});

test('contextsMatch requires client, project, work type, and task key', () => {
  const context = buildTimerContextFields({
    clientId: 'client1',
    projectId: 'proj1',
    workCategoryId: 'cat1',
    taskId: 'taskA',
  });

  const timer = {
    clientId: 'client1',
    projectId: 'proj1',
    workCategoryId: 'cat1',
    taskId: 'taskA',
    taskKey: 'taskA',
  };

  assert.equal(contextsMatch(timer, context), true);

  const differentTask = { ...timer, taskId: 'taskB', taskKey: 'taskB' };
  assert.equal(contextsMatch(differentTask, context), false);
});
