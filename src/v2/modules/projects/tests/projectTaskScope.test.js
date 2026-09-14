const test = require('node:test');
const assert = require('node:assert/strict');

const projectService = require('../services/project.service');
const projectRepository = require('../repositories/project.repository');
const projectAssignmentRepository = require('../repositories/projectAssignment.repository');
const projectStatsService = require('../services/projectStats.service');
const userRepository = require('../../users/repositories/user.repository');
const clientRepository = require('../../clients/repositories/client.repository');

const PROJECT_ONE = '507f1f77bcf86cd799439011';
const PROJECT_TWO = '507f1f77bcf86cd799439012';
const USER_ID = '507f1f77bcf86cd799439013';
const ACCOUNT_ID = '507f1f77bcf86cd799439014';
const projects = [
  { _id: PROJECT_ONE, name: 'Assigned project', status: 'active', isDeleted: false },
  { _id: PROJECT_TWO, name: 'Unrelated project', status: 'active', isDeleted: false },
];

const saved = {
  listProjectsPage: projectRepository.listProjectsPage,
  listActiveProjectIdsByUserId: projectAssignmentRepository.listActiveProjectIdsByUserId,
  listActiveByProjectIdsAndUserId: projectAssignmentRepository.listActiveByProjectIdsAndUserId,
  resolveStatsForList: projectStatsService.resolveStatsForList,
  buildAssignmentScopedStats: projectStatsService.buildAssignmentScopedStats,
  findByAccountId: userRepository.findByAccountId,
  findIdsBySearch: clientRepository.findIdsBySearch,
};

test.beforeEach(() => {
  userRepository.findByAccountId = async () => ({ _id: USER_ID });
  clientRepository.findIdsBySearch = async () => [];
  projectAssignmentRepository.listActiveProjectIdsByUserId = async () => [PROJECT_ONE];
  projectAssignmentRepository.listActiveByProjectIdsAndUserId = async () => [];
  projectStatsService.resolveStatsForList = async () => ({
    statsByProjectId: new Map(), cachedFound: 0, missingCount: 0, fallbackRecalculated: 0,
  });
  projectStatsService.buildAssignmentScopedStats = () => null;
  projectRepository.listProjectsPage = async (filters) => {
    const visible = projects.filter((project) =>
      (!filters.projectIds || filters.projectIds.some((id) => String(id) === String(project._id)))
      && (!filters.search || project.name.toLowerCase().includes(String(filters.search).toLowerCase()))
    );
    return { items: visible, total: visible.length };
  };
});

test.afterEach(() => {
  Object.entries(saved).forEach(([key, value]) => {
    if (key === 'findByAccountId') userRepository[key] = value;
    else if (key === 'findIdsBySearch') clientRepository[key] = value;
    else if (key === 'resolveStatsForList' || key === 'buildAssignmentScopedStats') projectStatsService[key] = value;
    else if (key === 'listProjectsPage') projectRepository[key] = value;
    else projectAssignmentRepository[key] = value;
  });
});

test('normal-user project list and search exclude unrelated projects even with broad permissions', async () => {
  const req = { v2Auth: { accountId: ACCOUNT_ID, account: { accountType: 'user' }, permissions: ['projects.manage', 'tasks.manage'] } };
  const list = await projectService.listProjects({ include_team_summary: 'false' }, req);
  assert.deepEqual(list.items.map((project) => project.name), ['Assigned project']);
  const searched = await projectService.listProjects({ search: 'Unrelated', include_team_summary: 'false' }, req);
  assert.deepEqual(searched.items, []);
  await assert.rejects(
    () => projectService.listProjects({ assignedUserId: '507f1f77bcf86cd799439015' }, req),
    (error) => error.status === 403,
  );
});

test('Super Admin project list includes every permitted project', async () => {
  const req = { v2Auth: { accountId: ACCOUNT_ID, account: { accountType: 'super_admin' }, permissions: ['projects.view'] } };
  const list = await projectService.listProjects({ include_team_summary: 'false' }, req);
  assert.deepEqual(list.items.map((project) => project.name), ['Assigned project', 'Unrelated project']);
  assert.equal(list.pagination.total, 2);
});

test('employee with employee then super_admin RBAC roles bypasses assignment scope', async () => {
  let assignmentLookups = 0;
  projectAssignmentRepository.listActiveProjectIdsByUserId = async () => {
    assignmentLookups += 1;
    return [];
  };
  const req = {
    v2Auth: {
      accountId: ACCOUNT_ID,
      account: { accountType: 'employee' },
      sessionAccess: { roles: [{ key: 'employee' }, { key: 'super_admin' }] },
      permissions: ['projects.view'],
    },
  };

  const list = await projectService.listProjects({ include_team_summary: 'false' }, req);
  assert.deepEqual(list.items.map((project) => project.name), ['Assigned project', 'Unrelated project']);
  assert.equal(list.pagination.total, 2);
  assert.equal(assignmentLookups, 0);
});

test('normal user with no active assignments receives an empty project list', async () => {
  projectAssignmentRepository.listActiveProjectIdsByUserId = async () => [];
  const req = { v2Auth: { accountId: ACCOUNT_ID, account: { accountType: 'user' }, permissions: ['projects.manage'] } };
  const list = await projectService.listProjects({}, req);
  assert.deepEqual(list.items, []);
  assert.equal(list.pagination.total, 0);
});
