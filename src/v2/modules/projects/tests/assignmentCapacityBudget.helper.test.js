const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const projectId = new Types.ObjectId();
const accountId = new Types.ObjectId();

const budgets = [];
const assignments = [
  {
    allocation: { allocatedMinutes: 1200 },
    status: 'active',
  },
];

const project = {
  _id: projectId,
  type: 'fixed_hours',
  status: 'active',
  settings: { autoApproveInitialBudgetOnActivation: true },
};

const projectBudgetRepository = {
  listByProjectId: async () => budgets,
  createBudget: async (payload) => {
    const row = { _id: new Types.ObjectId(), ...payload, isDeleted: false };
    budgets.push(row);
    return row;
  },
};

const projectAssignmentRepository = {
  listByProjectId: async () => assignments,
};

let eventRecorded = false;
const projectEventService = {
  recordEvent: async () => {
    eventRecorded = true;
  },
};

const { ensureApprovedCapacityCoversAssignments } = require('../helpers/assignmentCapacityBudget.helper');

test('creates initial approved budget when assignments exist but capacity is zero', async () => {
  const created = await ensureApprovedCapacityCoversAssignments(
    project,
    accountId,
    null,
    { projectBudgetRepository, projectAssignmentRepository, projectEventService },
  );

  assert.ok(created);
  assert.equal(created.approvedMinutes, 1200);
  assert.equal(created.entryType, 'initial');
  assert.equal(created.approvalStatus, 'approved');
  assert.equal(eventRecorded, true);
});
