const test = require('node:test');
const assert = require('node:assert/strict');

const projectActivityIntegration = require('../services/projectActivityIntegration.service');
const projectService = require('../services/project.service');
const projectStatsService = require('../services/projectStats.service');
const retainerRenewalService = require('../services/retainerRenewal.service');
const projectRepository = require('../repositories/project.repository');
const projectAssignmentRepository = require('../repositories/projectAssignment.repository');
const userRepository = require('../../users/repositories/user.repository');

const PROJECT_ID = '507f1f77bcf86cd799439011';
const EMPLOYEE_ID = '507f1f77bcf86cd799439012';

const saved = {
  findProject: projectRepository.findById,
  findAssignment: projectAssignmentRepository.findByProjectAndUser,
  findUserByAccount: userRepository.findByAccountId,
  ensureRetainerBudget: retainerRenewalService.ensureRetainerBudgetOnAccess,
};

test.afterEach(() => {
  projectRepository.findById = saved.findProject;
  projectAssignmentRepository.findByProjectAndUser = saved.findAssignment;
  userRepository.findByAccountId = saved.findUserByAccount;
  retainerRenewalService.ensureRetainerBudgetOnAccess = saved.ensureRetainerBudget;
});

test('employee cannot access activity for an unassigned project', async () => {
  projectRepository.findById = async () => ({ _id: PROJECT_ID, isDeleted: false });
  projectAssignmentRepository.findByProjectAndUser = async () => null;

  await assert.rejects(
    () => projectActivityIntegration.getProjectForActivity(PROJECT_ID, {
      v2Activity: {
        userId: EMPLOYEE_ID,
        permissions: ['activity.view', 'projects.view'],
      },
    }),
    (err) => err.status === 403
  );
});

test('view-all user can access project activity without an assignment', async () => {
  projectRepository.findById = async () => ({ _id: PROJECT_ID, isDeleted: false });
  projectAssignmentRepository.findByProjectAndUser = async () => null;

  const project = await projectActivityIntegration.getProjectForActivity(PROJECT_ID, {
    v2Activity: {
      userId: EMPLOYEE_ID,
      permissions: ['activity.view', 'activity.view_all'],
    },
  });

  assert.equal(project._id, PROJECT_ID);
});

test('assignment-scoped stats contain no team-wide totals', () => {
  const result = projectStatsService.buildAssignmentScopedStats(PROJECT_ID, {
    allocation: { allocatedMinutes: 480 },
    stats: { consumedMinutes: 120, remainingMinutes: 360 },
  });

  assert.equal(result.totalApprovedMinutes, 480);
  assert.equal(result.totalAssignedMinutes, 480);
  assert.equal(result.totalConsumedMinutes, 120);
  assert.equal(result.totalRemainingMinutes, 360);
  assert.equal(result.totalAvailableToAssignMinutes, 0);
  assert.equal(result.totalMembers, 1);
});

test('employee project detail exposes only assignment-scoped stats', async () => {
  projectRepository.findById = async () => ({
    _id: PROJECT_ID,
    name: 'Private project',
    isDeleted: false,
  });
  userRepository.findByAccountId = async () => ({ _id: EMPLOYEE_ID });
  projectAssignmentRepository.findByProjectAndUser = async () => ({
    _id: '507f1f77bcf86cd799439014',
    projectId: PROJECT_ID,
    userId: EMPLOYEE_ID,
    status: 'active',
    isDeleted: false,
    allocation: { allocatedMinutes: 480 },
    stats: { consumedMinutes: 120, remainingMinutes: 360 },
  });
  retainerRenewalService.ensureRetainerBudgetOnAccess = async () => null;

  const result = await projectService.getProjectById(PROJECT_ID, {
    v2Auth: {
      accountId: '507f1f77bcf86cd799439015',
      permissions: ['projects.view', 'activity.view'],
    },
  });

  assert.equal(result.stats.totalAssignedMinutes, 480);
  assert.equal(result.stats.totalConsumedMinutes, 120);
  assert.equal(result.stats.totalRemainingMinutes, 360);
  assert.equal(result.myAssignment.userId, EMPLOYEE_ID);
});

test('employee project detail rejects an unassigned project', async () => {
  projectRepository.findById = async () => ({
    _id: PROJECT_ID,
    name: 'Private project',
    isDeleted: false,
  });
  userRepository.findByAccountId = async () => ({ _id: EMPLOYEE_ID });
  projectAssignmentRepository.findByProjectAndUser = async () => null;
  retainerRenewalService.ensureRetainerBudgetOnAccess = async () => null;

  await assert.rejects(
    () => projectService.getProjectById(PROJECT_ID, {
      v2Auth: {
        accountId: '507f1f77bcf86cd799439015',
        permissions: ['projects.view', 'activity.view'],
      },
    }),
    (err) => err.status === 403
  );
});
