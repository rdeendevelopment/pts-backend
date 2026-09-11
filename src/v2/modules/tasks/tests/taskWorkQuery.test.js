const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMatch, dueRange, isUnassignedCondition, assigneeCondition, isSuperAdminRequest, projectPersonalScopeCondition, assigneeSummaries } = require('../services/taskWork.service');
const { dateKey } = require('../services/taskDueNotification.service');
const { toTaskDto } = require('../dto/task.dto');

test('My Work query defaults to active and escapes regex search', () => {
  const match = buildMatch({ search: 'a+b[1]' });
  assert.equal(match.status, 'active');
  assert.equal(match.$or[0].title.test('a+b[1]'), true);
  assert.equal(match.$or[0].title.test('ab1'), false);
});

test('completed and overdue query states remain explicit', () => {
  assert.equal(buildMatch({ lifecycleState: 'completed' }).status, 'completed');
  const overdue = buildMatch({ overdue: 'true' });
  assert.equal(overdue.status, 'active');
  assert.ok(overdue.dueDate.$lt instanceof Date);
});

test('column pagination filters support grouped statuses and due-date groups', () => {
  const todo = '507f1f77bcf86cd799439014';
  const review = '507f1f77bcf86cd799439015';
  const grouped = buildMatch({ workflowStatusIds: `${todo},${review}` });
  assert.deepEqual(grouped.workflowStatusId.$in.map(String), [todo, review]);
  assert.equal(buildMatch({ dueGroup: 'none' }).dueDate, null);
  assert.ok(buildMatch({ dueGroup: 'upcoming' }).dueDate.$gte instanceof Date);
});

test('aggregation filters cast validated identifiers to Mongo ObjectIds', () => {
  const projectId = '507f1f77bcf86cd799439012';
  const statusId = '507f1f77bcf86cd799439014';
  const match = buildMatch({ projectId, workflowStatusId: statusId });
  assert.equal(match.projectId instanceof require('mongoose').Types.ObjectId, true);
  assert.equal(match.workflowStatusId instanceof require('mongoose').Types.ObjectId, true);
  assert.equal(String(match.projectId), projectId);
  assert.equal(String(match.workflowStatusId), statusId);
});

test('My Work includes primary and secondary assignees', () => {
  const userId = '507f1f77bcf86cd799439015';
  assert.deepEqual(assigneeCondition(userId), { $or: [
    { primaryAssigneeId: userId },
    { 'assignees.userId': userId },
  ] });
});

test('Team Work summaries preserve every assignee and resolved profile data', () => {
  const first = '507f1f77bcf86cd799439015';
  const second = '507f1f77bcf86cd799439016';
  const rows = assigneeSummaries({ assignees: [
    { userId: first, name: 'Legacy First' },
    { userId: second, email: 'legacy@example.com' },
  ] }, {
    [first]: { firstName: 'Amina', lastName: 'Ali', email: 'amina@example.com', avatarUrl: '/a.png' },
    [second]: { displayName: 'Bilal Khan', email: 'bilal@example.com' },
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.userId), [first, second]);
  assert.equal(rows[0].email, 'amina@example.com');
  assert.equal(rows[0].avatarUrl, '/a.png');
  assert.equal(rows[1].email, 'bilal@example.com');
});

test('whole-project My Tasks access recognizes only super admins', () => {
  assert.equal(isSuperAdminRequest({ v2Auth: { accountType: 'super_admin' } }), true);
  assert.equal(isSuperAdminRequest({ v2Auth: { accountType: 'employee', roles: [{ key: 'super_admin' }] } }), true);
  assert.equal(isSuperAdminRequest({ v2Auth: { accountType: 'admin', roles: ['admin'] } }), false);
  assert.equal(isSuperAdminRequest({ v2Auth: { accountType: 'employee' } }), false);
});

test('regular project scope is limited to creator or assignee', () => {
  const accountId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439015';
  assert.deepEqual(projectPersonalScopeCondition(accountId, userId), { $or: [
    { createdBy: accountId },
    { primaryAssigneeId: userId },
    { 'assignees.userId': userId },
  ] });
});

test('management due windows are bounded and unassigned requires no legacy primary', () => {
  const now = new Date('2026-09-10T10:00:00.000Z');
  const tomorrow = dueRange('tomorrow', now);
  assert.ok(tomorrow.$gte instanceof Date);
  assert.ok(tomorrow.$lt > tomorrow.$gte);
  const unassigned = isUnassignedCondition();
  assert.equal(unassigned.primaryAssigneeId, null);
  assert.deepEqual(unassigned.$or[1], { assignees: { $size: 0 } });
});

test('task DTO falls back to first legacy assignee for primary', () => {
  const dto = toTaskDto({
    _id: '507f1f77bcf86cd799439011', projectId: '507f1f77bcf86cd799439012',
    workflowId: '507f1f77bcf86cd799439013', workflowStatusId: '507f1f77bcf86cd799439014',
    assignees: [{ userId: '507f1f77bcf86cd799439015' }],
  });
  assert.equal(dto.primaryAssigneeId, '507f1f77bcf86cd799439015');
});

test('due notification day key respects configured timezone', () => {
  const instant = new Date('2026-01-01T20:00:00.000Z');
  assert.equal(dateKey(instant, 'UTC'), '2026-01-01');
  assert.equal(dateKey(instant, 'Asia/Karachi'), '2026-01-02');
});
