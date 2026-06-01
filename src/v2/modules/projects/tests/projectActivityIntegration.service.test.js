const test = require('node:test');
const assert = require('node:assert/strict');

const projectActivityIntegration = require('../services/projectActivityIntegration.service');
const projectRepository = require('../repositories/project.repository');
const projectBudgetRepository = require('../repositories/projectBudget.repository');

const PROJECT_ID = '507f1f77bcf86cd799439011';

const saved = {
  findById: projectRepository.findById,
  listByProjectId: projectBudgetRepository.listByProjectId,
};

test.afterEach(() => {
  projectRepository.findById = saved.findById;
  projectBudgetRepository.listByProjectId = saved.listByProjectId;
});

test('getApprovedBudgetsForProject honors approvalStatus when legacy status is pending', async () => {
  projectRepository.findById = async () => ({
    _id: PROJECT_ID,
    type: 'retainer',
    retainerRenewalDay: 1,
  });

  const periodStart = new Date('2026-06-01T00:00:00.000Z');
  const periodEnd = new Date('2026-06-30T23:59:59.999Z');

  projectBudgetRepository.listByProjectId = async () => ([
    {
      _id: '507f1f77bcf86cd799439012',
      projectId: PROJECT_ID,
      isDeleted: false,
      approvalStatus: 'approved',
      status: 'pending_admin_approval',
      entryType: 'retainer_cycle',
      approvedMinutes: 4800,
      consumedMinutes: 0,
      periodStart,
      periodEnd,
    },
  ]);

  const budgets = await projectActivityIntegration.getApprovedBudgetsForProject(PROJECT_ID);

  assert.equal(budgets.length, 1);
  assert.equal(String(budgets[0]._id), '507f1f77bcf86cd799439012');
});
