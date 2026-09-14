const test = require('node:test');
const assert = require('node:assert/strict');
const userRepository = require('../../users/repositories/user.repository');
const assignmentRepository = require('../../projects/repositories/projectAssignment.repository');
const taskMemberRepository = require('../repositories/taskMember.repository');
const collaboratorRepository = require('../repositories/taskCollaborator.repository');
const { resolveTaskCapabilities } = require('../helpers/taskMutationAccess.helper');

const ids = {
  account: '507f1f77bcf86cd799439011', user: '507f1f77bcf86cd799439012',
  project: '507f1f77bcf86cd799439013', task: '507f1f77bcf86cd799439014',
};
const taskDoc = { _id: ids.task, projectId: ids.project, createdBy: '507f1f77bcf86cd799439099' };

async function withAccess({ assignment = null, collaborator = null, permissions = [], accountType = 'employee', boardShare = null }, fn) {
  const originals = {
    user: userRepository.findByAccountId,
    assignment: assignmentRepository.findByProjectAndUser,
    member: taskMemberRepository.findByProjectAndUser,
    collaborator: collaboratorRepository.findActiveByTaskAndUser,
  };
  userRepository.findByAccountId = async () => ({ _id: ids.user });
  assignmentRepository.findByProjectAndUser = async () => assignment;
  taskMemberRepository.findByProjectAndUser = async () => null;
  collaboratorRepository.findActiveByTaskAndUser = async () => collaborator;
  try {
    await fn({ v2Auth: { accountId: ids.account, permissions, account: { accountType } }, boardShare });
  } finally { Object.assign(userRepository, { findByAccountId: originals.user });
    Object.assign(assignmentRepository, { findByProjectAndUser: originals.assignment });
    Object.assign(taskMemberRepository, { findByProjectAndUser: originals.member });
    Object.assign(collaboratorRepository, { findActiveByTaskAndUser: originals.collaborator }); }
}

test('project member retains full day-to-day task capabilities', async () => {
  await withAccess({ assignment: { role: 'member', status: 'active' } }, async (req) => {
    const caps = await resolveTaskCapabilities(req, taskDoc);
    assert.equal(caps.canView, true); assert.equal(caps.canEdit, true); assert.equal(caps.canArchive, true);
  });
});

for (const accessType of ['comment', 'review']) {
  test(`${accessType} task-only collaborator can view/comment/upload but cannot mutate fields`, async () => {
    await withAccess({ collaborator: { accessType, isActive: true } }, async (req) => {
      const caps = await resolveTaskCapabilities(req, taskDoc);
      assert.equal(caps.collaboratorOnly, true); assert.equal(caps.canView, true);
      assert.equal(caps.canComment, true); assert.equal(caps.canUploadAttachment, true);
      assert.equal(caps.canEdit, false); assert.equal(caps.canMove, false); assert.equal(caps.canArchive, false);
    });
  });
}

test('edit task-only collaborator can edit/move/complete but cannot archive/delete/manage collaborators', async () => {
  await withAccess({ collaborator: { accessType: 'edit', isActive: true } }, async (req) => {
    const caps = await resolveTaskCapabilities(req, taskDoc);
    assert.equal(caps.canEdit, true); assert.equal(caps.canMove, true); assert.equal(caps.canComplete, true);
    assert.equal(caps.canArchive, false); assert.equal(caps.canDelete, false); assert.equal(caps.canManageCollaborators, false);
  });
});

test('removed collaborator and unrelated employee have no task access', async () => {
  await withAccess({}, async (req) => {
    const caps = await resolveTaskCapabilities(req, taskDoc);
    assert.equal(caps.canView, false); assert.equal(caps.canComment, false); assert.equal(caps.canEdit, false);
  });
});

test('manager tasks.manage retains capabilities on an assigned project', async () => {
  await withAccess({ assignment: { role: 'member', status: 'active' }, permissions: ['tasks.manage'], accountType: 'manager' }, async (req) => {
    const caps = await resolveTaskCapabilities(req, taskDoc);
    assert.equal(caps.canView, true); assert.equal(caps.canDelete, true); assert.equal(caps.canManageCollaborators, true);
  });
});

test('manager tasks.manage cannot read an unassigned project task', async () => {
  await withAccess({ permissions: ['tasks.manage'], accountType: 'manager' }, async (req) => {
    const caps = await resolveTaskCapabilities(req, taskDoc);
    assert.equal(caps.canView, false);
  });
});

test('client board-share viewer remains read-only', async () => {
  await withAccess({ accountType: 'client', boardShare: { role: 'viewer' } }, async (req) => {
    const caps = await resolveTaskCapabilities(req, taskDoc);
    assert.equal(caps.canView, true); assert.equal(caps.canEdit, false); assert.equal(caps.canComment, false);
  });
});
