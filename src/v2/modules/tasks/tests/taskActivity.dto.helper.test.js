const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mapEventTypeToAction,
  toActivityEntryDto,
} = require('../helpers/taskActivity.dto.helper');
const { toCommentAttachmentDto } = require('../dto/task.dto');

test('mapEventTypeToAction maps v2 event types to legacy actions', () => {
  assert.equal(mapEventTypeToAction({ eventType: 'TASK_CREATED' }), 'created');
  assert.equal(mapEventTypeToAction({ eventType: 'TASK_MOVED' }), 'moved');
  assert.equal(
    mapEventTypeToAction({ eventType: 'TASK_UPDATED', metadata: { action: 'attachment_added' } }),
    'attachment_added',
  );
});

test('toActivityEntryDto exposes legacy-compatible activity row', () => {
  const row = toActivityEntryDto(
    {
      _id: '507f1f77bcf86cd799439011',
      eventType: 'TASK_COMMENT_ADDED',
      taskId: '507f1f77bcf86cd799439012',
      projectId: '507f1f77bcf86cd799439013',
      performedBy: '507f1f77bcf86cd799439014',
      metadata: { text: 'Hello' },
      createdAt: new Date('2026-05-21T10:00:00.000Z'),
    },
    {
      task: { title: 'Deploy', taskNumber: 4, projectId: '507f1f77bcf86cd799439013' },
      projectName: 'PTS Web',
      actorName: 'Admin User',
    },
  );

  assert.equal(row.action, 'comment_added');
  assert.equal(row.taskTitle, 'Deploy');
  assert.equal(row.performedByName, 'Admin User');
  assert.equal(row.projectRef.sourceId, '507f1f77bcf86cd799439013');
  assert.equal(row.projectName, 'PTS Web');
});

test('toCommentAttachmentDto maps stored upload metadata', () => {
  const dto = toCommentAttachmentDto({
    fileName: 'spec.pdf',
    fileUrl: '/uploads/task-v2/2026/05/spec.pdf',
    mimeType: 'application/pdf',
    fileSize: 1234,
  });

  assert.equal(dto.name, 'spec.pdf');
  assert.equal(dto.url, '/uploads/task-v2/2026/05/spec.pdf');
  assert.equal(dto.mimeType, 'application/pdf');
  assert.equal(dto.size, 1234);
  assert.equal(dto.storageProvider, 'local');
});
