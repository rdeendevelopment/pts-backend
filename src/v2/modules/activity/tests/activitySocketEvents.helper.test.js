const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildWeekSubmitPayload,
  buildWeekApprovePayload,
  buildWeekRejectPayload,
  buildTimerPayload,
} = require('../helpers/activitySocketEvents.helper');

test('buildWeekSubmitPayload returns DTO-safe submit fields', () => {
  const payload = buildWeekSubmitPayload({
    id: '507f1f77bcf86cd799439020',
    userId: '507f1f77bcf86cd799439012',
    weekStartDate: new Date('2026-05-19T00:00:00.000Z'),
    weekEndDate: new Date('2026-05-25T23:59:59.999Z'),
    totalMinutes: 120,
    totalEntries: 1,
    status: 'submitted',
  });

  assert.equal(payload.weekId, '507f1f77bcf86cd799439020');
  assert.equal(payload.userId, '507f1f77bcf86cd799439012');
  assert.equal(payload.totalMinutes, 120);
  assert.equal(payload.totalEntries, 1);
  assert.equal(payload.status, 'submitted');
});

test('buildWeekApprovePayload includes approval metadata', () => {
  const approvedAt = new Date('2026-05-20T10:00:00.000Z');
  const payload = buildWeekApprovePayload({
    id: '507f1f77bcf86cd799439020',
    userId: '507f1f77bcf86cd799439012',
    status: 'approved',
    approvedBy: '507f1f77bcf86cd799439001',
    approvedAt,
    lockedAt: approvedAt,
  });

  assert.equal(payload.approvedBy, '507f1f77bcf86cd799439001');
  assert.equal(payload.approvedAt, approvedAt);
  assert.equal(payload.lockedAt, approvedAt);
});

test('buildWeekRejectPayload includes rejection metadata', () => {
  const rejectedAt = new Date('2026-05-20T11:00:00.000Z');
  const payload = buildWeekRejectPayload({
    id: '507f1f77bcf86cd799439020',
    userId: '507f1f77bcf86cd799439012',
    status: 'rejected',
    rejectedBy: '507f1f77bcf86cd799439001',
    rejectedAt,
    rejectionReason: 'Revise entries',
  });

  assert.equal(payload.rejectedBy, '507f1f77bcf86cd799439001');
  assert.equal(payload.rejectedAt, rejectedAt);
  assert.equal(payload.rejectionReason, 'Revise entries');
});

test('buildTimerPayload keeps only timer summary fields', () => {
  const payload = buildTimerPayload({
    id: '507f1f77bcf86cd799439030',
    userId: '507f1f77bcf86cd799439012',
    projectId: '507f1f77bcf86cd799439013',
    assignmentId: '507f1f77bcf86cd799439011',
    workCategoryId: '507f1f77bcf86cd799439016',
    startedAt: new Date('2026-05-19T09:00:00.000Z'),
    stoppedAt: new Date('2026-05-19T10:00:00.000Z'),
    status: 'stopped',
  });

  assert.equal(payload.id, '507f1f77bcf86cd799439030');
  assert.equal(payload.projectId, '507f1f77bcf86cd799439013');
  assert.equal(payload.status, 'stopped');
  assert.equal(Object.keys(payload).length, 8);
});
