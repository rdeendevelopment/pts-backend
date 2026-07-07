const test = require('node:test');
const assert = require('node:assert/strict');

const projectActivityReportService = require('../services/projectActivityReport.service');
const activityAdminService = require('../services/activityAdmin.service');
const activitySocketEvents = require('../helpers/activitySocketEvents.helper');
const projectsModule = require('../../projects');
const projectAssignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const timeEntryRepository = require('../repositories/timeEntry.repository');
const timeWeekRepository = require('../repositories/timeWeek.repository');
const userRepository = require('../../users/repositories/user.repository');

const userSummaryHelper = require('../helpers/userSummary.helper');

const saved = {
  getProjectForActivity: projectsModule.getProjectForActivity,
  getProjectStats: projectsModule.getProjectStats,
  getAssignmentForUser: projectsModule.getAssignmentForUser,
  listByProjectId: projectAssignmentRepository.listByProjectId,
  listEntries: timeEntryRepository.listEntries,
  findById: timeWeekRepository.findById,
  findByUserAndWeekStart: timeWeekRepository.findByUserAndWeekStart,
  findUserById: userRepository.findById,
  emitActivityWeekReminder: activitySocketEvents.emitActivityWeekReminder,
  resolveUsersByIds: userSummaryHelper.resolveUsersByIds,
};

test.afterEach(() => {
  projectsModule.getProjectForActivity = saved.getProjectForActivity;
  projectsModule.getProjectStats = saved.getProjectStats;
  projectsModule.getAssignmentForUser = saved.getAssignmentForUser;
  projectAssignmentRepository.listByProjectId = saved.listByProjectId;
  timeEntryRepository.listEntries = saved.listEntries;
  timeWeekRepository.findById = saved.findById;
  timeWeekRepository.findByUserAndWeekStart = saved.findByUserAndWeekStart;
  userRepository.findById = saved.findUserById;
  activitySocketEvents.emitActivityWeekReminder = saved.emitActivityWeekReminder;
  userSummaryHelper.resolveUsersByIds = saved.resolveUsersByIds;
});

test('getProjectSummary groups entries by week and returns stats', async () => {
  const projectId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';
  const weekId = '507f1f77bcf86cd799439013';

  projectsModule.getProjectForActivity = async () => ({ _id: projectId });
  projectsModule.getProjectStats = async () => ({
    totalApprovedMinutes: 1000,
    totalAssignedMinutes: 800,
    totalConsumedMinutes: 300,
    totalRemainingMinutes: 700,
    totalAvailableToAssignMinutes: 200,
  });
  projectsModule.getAssignmentForUser = async () => ({
    allocation: { allocatedMinutes: 480 },
    stats: { consumedMinutes: 120, remainingMinutes: 360 },
  });
  projectAssignmentRepository.listByProjectId = async () => [];
  timeEntryRepository.listEntries = async () => ([
    {
      _id: 'e1',
      timeWeekId: weekId,
      projectId,
      userId,
      minutes: 60,
      status: 'draft',
      entryDate: new Date('2026-05-19T12:00:00.000Z'),
    },
    {
      _id: 'e2',
      timeWeekId: weekId,
      projectId,
      userId,
      minutes: 30,
      status: 'submitted',
      entryDate: new Date('2026-05-20T12:00:00.000Z'),
    },
  ]);
  timeWeekRepository.findById = async () => ({
    _id: weekId,
    weekStartDate: new Date('2026-05-19T00:00:00.000Z'),
    weekEndDate: new Date('2026-05-25T23:59:59.999Z'),
    status: 'submitted',
  });
  userRepository.findById = async () => ({
    _id: userId,
    firstName: 'Pat',
    lastName: 'Lee',
    email: 'pat@example.com',
  });

  const result = await projectActivityReportService.getProjectSummary(projectId, {}, {
    v2Activity: { userId, permissions: [] },
  });

  assert.equal(result.totalMinutes, 90);
  assert.equal(result.approvedMinutes, 480);
  assert.equal(result.assignedMinutes, 480);
  assert.equal(result.consumedMinutes, 120);
  assert.equal(result.weeks.length, 1);
  assert.equal(result.weeks[0].totalMinutes, 90);
  assert.equal(result.weeks[0].status, 'submitted');
  assert.equal(result.statusTotals.draft, 60);
  assert.equal(result.statusTotals.submitted, 30);
});

test('getProjectWeeklyActivity returns seven grouped days', async () => {
  const projectId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';

  projectsModule.getProjectForActivity = async () => ({ _id: projectId });
  userSummaryHelper.resolveUsersByIds = async (ids = []) => {
    const map = new Map();
    ids.forEach((id) => {
      map.set(String(id), {
        userId: String(id),
        firstName: 'Pat',
        lastName: 'Lee',
        email: 'pat@example.com',
      });
    });
    return map;
  };
  timeEntryRepository.listEntries = async () => ([
    {
      _id: 'e1',
      projectId,
      userId,
      minutes: 45,
      status: 'draft',
      entryDate: new Date('2026-05-19T12:00:00.000Z'),
      assignmentId: 'a1',
      workCategoryId: 'c1',
      timeWeekId: 'w1',
    },
  ]);

  const result = await projectActivityReportService.getProjectWeeklyActivity(
    projectId,
    { weekStartDate: '2026-05-19' },
    { v2Activity: { userId, permissions: [] } }
  );

  assert.equal(result.days.length, 7);
  assert.equal(result.totalMinutes, 45);
  assert.equal(result.entries.length, 1);
  assert.equal(result.users.length, 1);
});

test('employee project report endpoints always query only own entries', async () => {
  const projectId = '507f1f77bcf86cd799439011';
  const employeeId = '507f1f77bcf86cd799439012';
  const otherUserId = '507f1f77bcf86cd799439013';
  const captured = [];

  projectsModule.getProjectForActivity = async () => ({ _id: projectId });
  projectsModule.getProjectStats = async () => ({});
  projectsModule.getAssignmentForUser = async () => null;
  timeEntryRepository.listEntries = async (filters) => {
    captured.push(filters);
    return [];
  };
  userSummaryHelper.resolveUsersByIds = async () => new Map();

  const req = {
    v2Activity: {
      userId: employeeId,
      permissions: ['activity.view', 'projects.view'],
    },
  };
  const query = { userId: otherUserId, weekStartDate: '2026-05-19' };

  await projectActivityReportService.getProjectSummary(projectId, query, req);
  await projectActivityReportService.getProjectWeeklyActivity(projectId, query, req);
  await projectActivityReportService.listProjectTimeEntries(projectId, query, req);

  assert.equal(captured.length, 3);
  captured.forEach((filters) => {
    assert.equal(filters.projectId, projectId);
    assert.equal(filters.userId, employeeId);
  });
});

test('view-all project report keeps explicit user filter', async () => {
  const projectId = '507f1f77bcf86cd799439011';
  const requestedUserId = '507f1f77bcf86cd799439013';
  let captured = null;

  projectsModule.getProjectForActivity = async () => ({ _id: projectId });
  timeEntryRepository.listEntries = async (filters) => {
    captured = filters;
    return [];
  };
  userSummaryHelper.resolveUsersByIds = async () => new Map();

  await projectActivityReportService.listProjectTimeEntries(
    projectId,
    { userId: requestedUserId },
    {
      v2Activity: {
        userId: '507f1f77bcf86cd799439012',
        permissions: ['activity.view', 'activity.view_all'],
      },
    }
  );

  assert.equal(captured.userId, requestedUserId);
});

test('notifyMissingWeek rejects submitted weeks and emits reminder for missing weeks', async () => {
  const userId = '507f1f77bcf86cd799439012';
  let emitted = null;

  userRepository.findById = async () => ({ _id: userId, email: 'pat@example.com' });
  timeWeekRepository.findByUserAndWeekStart = async () => null;
  activitySocketEvents.emitActivityWeekReminder = (targetUserId, payload) => {
    emitted = { targetUserId, payload };
  };

  const result = await activityAdminService.notifyMissingWeek({
    userId,
    weekStartDate: '2026-05-19',
  }, 'admin-account');

  assert.equal(result.success, true);
  assert.equal(emitted.targetUserId, userId);
  assert.match(emitted.payload.message, /Reminder/);
});

test('notifyMissingWeek blocks already submitted weeks', async () => {
  userRepository.findById = async () => ({ _id: '507f1f77bcf86cd799439012' });
  timeWeekRepository.findByUserAndWeekStart = async () => ({ status: 'submitted' });

  await assert.rejects(
    () => activityAdminService.notifyMissingWeek({
      userId: '507f1f77bcf86cd799439012',
      weekStartDate: '2026-05-19',
    }, 'admin-account'),
    (err) => err.status === 409
  );
});
