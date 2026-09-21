const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanTitle, listScope, todayKey } = require('../services/todo.service');

function request({ superAdmin = false } = {}) {
  return { v2Auth: { accountId: '507f1f77bcf86cd799439011', account: { accountType: superAdmin ? 'super_admin' : 'employee' }, sessionAccess: { roles: [] } } };
}

test('minimal title is trimmed for Enter-to-create', () => assert.equal(cleanTitle('  Ship it  '), 'Ship it'));
test('empty titles are rejected', () => assert.throws(() => cleanTitle('   '), /required/));
test('standard users cannot filter private todos by another creator', () => {
  assert.throws(() => listScope(request(), { createdBy: '507f191e810c19729de860ea', date: '2026-09-21' }), /cannot view/);
});
test('super admins may use creator filters', () => {
  assert.equal(String(listScope(request({ superAdmin: true }), { createdBy: '507f191e810c19729de860ea', date: '2026-09-21' }).createdBy), '507f191e810c19729de860ea');
});
test('date, status, priority and personal project filters are normalized', () => {
  const scope = listScope(request(), { date: '2026-09-20', status: 'completed', priority: 'high', projectId: 'personal' });
  assert.deepEqual({ date: scope.todoDate, status: scope.status, priority: scope.priority, projectId: scope.projectId }, { date: '2026-09-20', status: 'completed', priority: 'high', projectId: null });
});
test('todayKey returns a local YYYY-MM-DD key', () => assert.equal(todayKey(new Date(2026, 8, 21, 23, 30)), '2026-09-21'));
