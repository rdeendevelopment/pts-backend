const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAccessType,
  mapAssignmentRoleToEditorRole,
  canEditProjectWithRole,
} = require('../helpers/taskCollaborator.helper');
const {
  assertPermanentDeleteAllowed,
  collectTaskFileUrls,
} = require('../helpers/taskPermanentDelete.helper');
const { toCollaboratorDto } = require('../dto/task.dto');

test('normalizeAccessType defaults unknown values to comment', () => {
  assert.equal(normalizeAccessType('edit'), 'edit');
  assert.equal(normalizeAccessType('invalid'), 'comment');
});

test('mapAssignmentRoleToEditorRole maps lead to admin', () => {
  assert.equal(mapAssignmentRoleToEditorRole('lead'), 'admin');
  assert.equal(canEditProjectWithRole('admin'), true);
  assert.equal(canEditProjectWithRole('viewer'), false);
});

test('assertPermanentDeleteAllowed requires archived status', () => {
  assert.throws(
    () => assertPermanentDeleteAllowed('active'),
    /Only archived tasks can be permanently deleted/
  );
  assert.doesNotThrow(() => assertPermanentDeleteAllowed('archived'));
});

test('collectTaskFileUrls gathers task and comment attachments', () => {
  const urls = collectTaskFileUrls(
    {
      attachments: [{ fileUrl: '/uploads/task-v2/2026/05/a.pdf' }],
    },
    [
      {
        attachments: [{ fileUrl: '/uploads/task-v2/2026/05/b.pdf' }],
      },
    ]
  );

  assert.deepEqual(urls, [
    '/uploads/task-v2/2026/05/a.pdf',
    '/uploads/task-v2/2026/05/b.pdf',
  ]);
});

test('toCollaboratorDto maps v2 collaborator for Angular UI', () => {
  const dto = toCollaboratorDto(
    {
      _id: '507f1f77bcf86cd799439011',
      taskId: '507f1f77bcf86cd799439012',
      projectId: '507f1f77bcf86cd799439013',
      userId: '507f1f77bcf86cd799439014',
      accessType: 'review',
      isActive: true,
      createdAt: '2026-05-21T10:00:00.000Z',
    },
    {
      email: 'collab@example.com',
      firstName: 'Casey',
      lastName: 'Lee',
    }
  );

  assert.equal(dto._id, '507f1f77bcf86cd799439011');
  assert.equal(dto.userId, '507f1f77bcf86cd799439014');
  assert.equal(dto.name, 'Casey Lee');
  assert.equal(dto.email, 'collab@example.com');
  assert.equal(dto.accessType, 'review');
});
