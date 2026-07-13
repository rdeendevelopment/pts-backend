const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildActivityUserScope,
  canViewAllProjectTimeEntries,
} = require('../helpers/access.helper');
const timeWeekService = require('../services/timeWeek.service');
const timeEntryService = require('../services/timeEntry.service');
const activityAdminService = require('../services/activityAdmin.service');
const timeWeekRepository = require('../repositories/timeWeek.repository');
const timeEntryRepository = require('../repositories/timeEntry.repository');

const EMPLOYEE_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';
const PROJECT_ID = '507f1f77bcf86cd799439013';

const employeeReq = {
  v2Activity: {
    userId: EMPLOYEE_ID,
    permissions: ['activity.view', 'projects.view'],
  },
};

const viewAllReq = {
  v2Activity: {
    userId: EMPLOYEE_ID,
    permissions: ['activity.view', 'activity.view_all'],
  },
};

const saved = {
  listWeeks: timeWeekRepository.listWeeks,
  summarizeWeeks: timeWeekRepository.summarizeWeeks,
  listEntries: timeEntryRepository.listEntries,
};

test.afterEach(() => {
  timeWeekRepository.listWeeks = saved.listWeeks;
  timeWeekRepository.summarizeWeeks = saved.summarizeWeeks;
  timeEntryRepository.listEntries = saved.listEntries;
});

test('projects.view does not grant activity view-all access', () => {
  assert.equal(canViewAllProjectTimeEntries(employeeReq), false);
  assert.equal(canViewAllProjectTimeEntries(viewAllReq), true);
});

test('employee activity scope overrides every supported user alias', () => {
  for (const query of [
    { userId: OTHER_USER_ID },
    { user_id: OTHER_USER_ID },
    { employeeId: OTHER_USER_ID },
    { employee_id: OTHER_USER_ID },
    { memberId: OTHER_USER_ID },
    { member_id: OTHER_USER_ID },
  ]) {
    assert.deepEqual(buildActivityUserScope(employeeReq, query), {
      userId: EMPLOYEE_ID,
    });
  }
});

test('view-all scope allows all records or an explicit user filter', () => {
  assert.deepEqual(buildActivityUserScope(viewAllReq), {});
  assert.deepEqual(buildActivityUserScope(viewAllReq, { userId: OTHER_USER_ID }), {
    userId: OTHER_USER_ID,
  });
});

test('employee week listing always reaches repository with own userId', async () => {
  let captured = null;
  timeWeekRepository.listWeeks = async (filters) => {
    captured = filters;
    return [];
  };
  timeWeekRepository.summarizeWeeks = async () => ({
    weekCount: 0,
    totalMinutes: 0,
    draftCount: 0,
    submittedCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
  });

  await timeWeekService.listWeeks({ userId: OTHER_USER_ID }, employeeReq);
  assert.equal(captured.userId, EMPLOYEE_ID);
});

test('employee time-entry listing keeps own userId when projectId is present', async () => {
  let captured = null;
  timeEntryRepository.listEntries = async (filters) => {
    captured = filters;
    return [];
  };

  await timeEntryService.listEntries({
    projectId: PROJECT_ID,
    userId: OTHER_USER_ID,
  }, employeeReq);

  assert.equal(captured.projectId, PROJECT_ID);
  assert.equal(captured.userId, EMPLOYEE_ID);
});

test('employee cannot access workforce summary', async () => {
  await assert.rejects(
    () => activityAdminService.getWorkforceSummary({}, employeeReq),
    (err) => err.status === 403
  );
});
