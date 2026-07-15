const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const timeValidationService = require('../services/timeValidation.service');
const timeEntryRepository = require('../repositories/timeEntry.repository');
const projectsModule = require('../../projects');
const workCategoryRepository = require('../repositories/workCategory.repository');
const activityErrorCodes = require('../errors/activityErrorCodes');

const ASSIGNMENT_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';
const PROJECT_ID = '507f1f77bcf86cd799439013';
const BUDGET_ID = '507f1f77bcf86cd799439015';
const CATEGORY_ID = '507f1f77bcf86cd799439016';
const EXCLUDE_ENTRY_ID = '507f1f77bcf86cd799439014';
const ENTRY_DATE = new Date('2026-05-19T12:00:00.000Z');

const assignmentBase = {
  _id: ASSIGNMENT_ID,
  userId: USER_ID,
  projectId: PROJECT_ID,
  allocation: {
    allocatedMinutes: 480,
    capPeriod: 'project',
    allowExceed: false,
    canLogTime: true,
  },
  stats: { consumedMinutes: 400 },
};

const saved = {
  sumMinutesForCap: timeEntryRepository.sumMinutesForCap,
  sumMinutes: timeEntryRepository.sumMinutes,
  getProjectForActivity: projectsModule.getProjectForActivity,
  getAssignmentForUser: projectsModule.getAssignmentForUser,
  getApprovedBudgetsForProject: projectsModule.getApprovedBudgetsForProject,
  getProjectStats: projectsModule.getProjectStats,
  findById: workCategoryRepository.findById,
};

afterEach(() => {
  timeEntryRepository.sumMinutesForCap = saved.sumMinutesForCap;
  timeEntryRepository.sumMinutes = saved.sumMinutes;
  projectsModule.getProjectForActivity = saved.getProjectForActivity;
  projectsModule.getAssignmentForUser = saved.getAssignmentForUser;
  projectsModule.getApprovedBudgetsForProject = saved.getApprovedBudgetsForProject;
  projectsModule.getProjectStats = saved.getProjectStats;
  workCategoryRepository.findById = saved.findById;
});

function stubValidationDependencies({
  project = {},
  assignment = {},
  budgets = [],
  pendingDraftMinutes = 0,
  draftBudgetMinutes = 0,
} = {}) {
  projectsModule.getProjectForActivity = async () => ({
    status: 'active',
    isDeleted: false,
    allowBudgetExceed: false,
    settings: { allowManualTimeEntry: true },
    ...project,
  });
  projectsModule.getAssignmentForUser = async () => ({
    ...assignmentBase,
    ...assignment,
  });
  projectsModule.getApprovedBudgetsForProject = async () => budgets;
  projectsModule.getProjectStats = async () => ({ totalRemainingMinutes: 1000 });
  workCategoryRepository.findById = async () => ({ status: 'active' });
  timeEntryRepository.sumMinutes = async (filters = {}) => {
    if (filters.assignmentId && filters.statuses?.includes('draft')) {
      return { totalMinutes: pendingDraftMinutes };
    }
    if (filters.budgetId && filters.statuses?.includes('draft')) {
      return { totalMinutes: draftBudgetMinutes };
    }
    return { totalMinutes: 0 };
  };
}

test('getCapConsumedMinutes uses assignment stats for project capPeriod', async () => {
  const calls = [];
  timeEntryRepository.sumMinutesForCap = async (filters) => {
    calls.push(filters);
    return { totalMinutes: 999 };
  };

  const total = await timeValidationService.getCapConsumedMinutes(
    { ...assignmentBase, stats: { consumedMinutes: 250 } },
    ENTRY_DATE
  );

  assert.equal(total, 250);
  assert.equal(calls.length, 0);
});

test('getCapConsumedMinutes scopes day cap to assignment, user, project, and day range', async () => {
  const calls = [];
  timeEntryRepository.sumMinutesForCap = async (filters) => {
    calls.push(filters);
    return { totalMinutes: 90 };
  };

  const total = await timeValidationService.getCapConsumedMinutes(
    {
      ...assignmentBase,
      allocation: { ...assignmentBase.allocation, capPeriod: 'day' },
    },
    ENTRY_DATE,
    EXCLUDE_ENTRY_ID
  );

  assert.equal(total, 90);
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].assignmentId), ASSIGNMENT_ID);
  assert.equal(String(calls[0].userId), USER_ID);
  assert.equal(String(calls[0].projectId), PROJECT_ID);
  assert.deepEqual(calls[0].statuses, ['submitted', 'approved']);
  assert.equal(String(calls[0].excludeEntryId), EXCLUDE_ENTRY_ID);

  const { getDayBounds } = require('../helpers/week.helper');
  const { dayStart, dayEnd } = getDayBounds(ENTRY_DATE);
  assert.equal(calls[0].entryDateFrom.toISOString(), dayStart.toISOString());
  assert.equal(calls[0].entryDateTo.toISOString(), dayEnd.toISOString());
});

test('getCapConsumedMinutes scopes week cap to configured business week range', async () => {
  const calls = [];
  timeEntryRepository.sumMinutesForCap = async (filters) => {
    calls.push(filters);
    return { totalMinutes: 120 };
  };

  await timeValidationService.getCapConsumedMinutes(
    {
      ...assignmentBase,
      allocation: { ...assignmentBase.allocation, capPeriod: 'week' },
    },
    ENTRY_DATE
  );

  assert.equal(calls.length, 1);
  const { weekStartDate, weekEndDate } = require('../helpers/week.helper').getWeekBounds(ENTRY_DATE);
  assert.equal(calls[0].entryDateFrom.toISOString(), weekStartDate.toISOString());
  assert.equal(calls[0].entryDateTo.toISOString(), weekEndDate.toISOString());
});

test('getCapConsumedMinutes scopes month cap to business month range', async () => {
  const calls = [];
  timeEntryRepository.sumMinutesForCap = async (filters) => {
    calls.push(filters);
    return { totalMinutes: 300 };
  };

  await timeValidationService.getCapConsumedMinutes(
    {
      ...assignmentBase,
      allocation: { ...assignmentBase.allocation, capPeriod: 'month' },
    },
    ENTRY_DATE
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].entryDateFrom.getUTCDate(), 1);
  assert.ok(calls[0].entryDateTo > calls[0].entryDateFrom);
});

test('project.allowBudgetExceed=true does not bypass assignment cap', async () => {
  stubValidationDependencies({
    project: { allowBudgetExceed: true },
    assignment: { allocation: { ...assignmentBase.allocation, allowExceed: false } },
    budgets: [{ _id: BUDGET_ID, approvedMinutes: 5000, consumedMinutes: 0 }],
    pendingDraftMinutes: 60,
  });

  await assert.rejects(
    () => timeValidationService.validateTimeEntry({
      projectId: PROJECT_ID,
      userId: USER_ID,
      workCategoryId: CATEGORY_ID,
      budgetId: BUDGET_ID,
      entryDate: ENTRY_DATE,
      minutes: 30,
      timeWeek: { _id: '507f1f77bcf86cd799439020', userId: USER_ID, status: 'draft' },
      throwOnError: true,
    }),
    (err) => err.code === activityErrorCodes.ACTIVITY_USER_CAP_EXCEEDED
  );
});

test('assignment.allowExceed=true bypasses assignment cap', async () => {
  stubValidationDependencies({
    project: { allowBudgetExceed: false },
    assignment: {
      allocation: { ...assignmentBase.allocation, allowExceed: true },
      stats: { consumedMinutes: 400 },
    },
    budgets: [{ _id: BUDGET_ID, approvedMinutes: 5000, consumedMinutes: 0 }],
    pendingDraftMinutes: 60,
  });

  const result = await timeValidationService.validateTimeEntry({
    projectId: PROJECT_ID,
    userId: USER_ID,
    workCategoryId: CATEGORY_ID,
    budgetId: BUDGET_ID,
    entryDate: ENTRY_DATE,
    minutes: 30,
    timeWeek: { _id: '507f1f77bcf86cd799439020', userId: USER_ID, status: 'draft' },
    throwOnError: true,
  });

  assert.equal(result.canLog, true);
});

test('zero-hour assignment with allowExceed can log without an hour budget', async () => {
  stubValidationDependencies({
    project: { type: 'fixed_budget', allowBudgetExceed: false },
    assignment: {
      allocation: {
        ...assignmentBase.allocation,
        allocatedMinutes: 0,
        allowExceed: true,
        canLogTime: true,
      },
      stats: { consumedMinutes: 0 },
    },
    budgets: [],
    pendingDraftMinutes: 0,
  });

  const result = await timeValidationService.validateTimeEntry({
    projectId: PROJECT_ID,
    userId: USER_ID,
    workCategoryId: CATEGORY_ID,
    entryDate: ENTRY_DATE,
    minutes: 60,
    timeWeek: { _id: '507f1f77bcf86cd799439020', userId: USER_ID, status: 'draft' },
    throwOnError: true,
  });

  assert.equal(result.canLog, true);
  assert.equal(result.budget, null);
});

test('budget exceed blocks when neither project nor assignment allows exceed', async () => {
  stubValidationDependencies({
    project: { allowBudgetExceed: false },
    assignment: {
      allocation: { ...assignmentBase.allocation, allowExceed: false },
      stats: { consumedMinutes: 0 },
    },
    budgets: [{ _id: BUDGET_ID, approvedMinutes: 1000, consumedMinutes: 900 }],
    pendingDraftMinutes: 0,
    draftBudgetMinutes: 100,
  });

  await assert.rejects(
    () => timeValidationService.validateTimeEntry({
      projectId: PROJECT_ID,
      userId: USER_ID,
      workCategoryId: CATEGORY_ID,
      budgetId: BUDGET_ID,
      entryDate: ENTRY_DATE,
      minutes: 200,
      timeWeek: { _id: '507f1f77bcf86cd799439020', userId: USER_ID, status: 'draft' },
      throwOnError: true,
    }),
    (err) => err.code === activityErrorCodes.ACTIVITY_PROJECT_BUDGET_EXCEEDED
  );
});

test('budget exceed is allowed when project allows exceed', async () => {
  stubValidationDependencies({
    project: { allowBudgetExceed: true },
    assignment: {
      allocation: { ...assignmentBase.allocation, allowExceed: false },
      stats: { consumedMinutes: 0 },
    },
    budgets: [{ _id: BUDGET_ID, approvedMinutes: 1000, consumedMinutes: 900 }],
    pendingDraftMinutes: 0,
    draftBudgetMinutes: 100,
  });

  const allowed = await timeValidationService.validateTimeEntry({
    projectId: PROJECT_ID,
    userId: USER_ID,
    workCategoryId: CATEGORY_ID,
    budgetId: BUDGET_ID,
    entryDate: ENTRY_DATE,
    minutes: 200,
    timeWeek: { _id: '507f1f77bcf86cd799439020', userId: USER_ID, status: 'draft' },
    throwOnError: true,
  });

  assert.equal(allowed.canLog, true);
});

test('budget exceed is allowed when assignment allows exceed', async () => {
  stubValidationDependencies({
    project: { allowBudgetExceed: false },
    assignment: {
      allocation: { ...assignmentBase.allocation, allowExceed: true },
      stats: { consumedMinutes: 0 },
    },
    budgets: [{ _id: BUDGET_ID, approvedMinutes: 1000, consumedMinutes: 900 }],
    pendingDraftMinutes: 0,
    draftBudgetMinutes: 100,
  });

  const allowed = await timeValidationService.validateTimeEntry({
    projectId: PROJECT_ID,
    userId: USER_ID,
    workCategoryId: CATEGORY_ID,
    budgetId: BUDGET_ID,
    entryDate: ENTRY_DATE,
    minutes: 200,
    timeWeek: { _id: '507f1f77bcf86cd799439020', userId: USER_ID, status: 'draft' },
    throwOnError: true,
  });

  assert.equal(allowed.canLog, true);
});
