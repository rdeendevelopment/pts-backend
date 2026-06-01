const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowed, isTaskUploadUrl, MAX_SIZE_BYTES } = require('../helpers/taskFileStorage.helper');
const { toAttachmentDto } = require('../dto/task.dto');

test('isAllowed accepts common pdf upload', () => {
  assert.equal(isAllowed('application/pdf', 'report.pdf'), true);
});

test('isAllowed rejects unknown extension', () => {
  assert.equal(isAllowed('application/octet-stream', 'payload.exe'), false);
});

test('isTaskUploadUrl validates task upload prefix', () => {
  assert.equal(isTaskUploadUrl('/uploads/task-v2/2026/05/file.pdf'), true);
  assert.equal(isTaskUploadUrl('/uploads/other/file.pdf'), false);
});

test('MAX_SIZE_BYTES defaults to 25MB', () => {
  assert.equal(MAX_SIZE_BYTES, 25 * 1024 * 1024);
});

test('toAttachmentDto maps v2 metadata to legacy UI fields', () => {
  const dto = toAttachmentDto({
    _id: '507f1f77bcf86cd799439011',
    fileName: 'spec.pdf',
    fileUrl: '/uploads/task-v2/2026/05/spec.pdf',
    mimeType: 'application/pdf',
    fileSize: 1234,
    uploadedBy: '507f1f77bcf86cd799439012',
    uploadedAt: '2026-05-21T10:00:00.000Z',
  });

  assert.equal(dto._id, '507f1f77bcf86cd799439011');
  assert.equal(dto.name, 'spec.pdf');
  assert.equal(dto.url, '/uploads/task-v2/2026/05/spec.pdf');
  assert.equal(dto.mimeType, 'application/pdf');
  assert.equal(dto.fileType, 'application/pdf');
  assert.equal(dto.size, 1234);
  assert.equal(dto.fileSize, 1234);
});
