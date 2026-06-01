const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const {
  transformLegacyProjectAttachment,
  isProjectAttachment,
} = require('../transformers/attachment.transformer');

test('isProjectAttachment accepts project parent type only', () => {
  assert.equal(isProjectAttachment({ parentType: 'project', parentId: new Types.ObjectId() }), true);
  assert.equal(isProjectAttachment({ parentType: 'task', parentId: new Types.ObjectId() }), false);
});

test('transformLegacyProjectAttachment maps legacy attachment fields', () => {
  const projectId = new Types.ObjectId();
  const result = transformLegacyProjectAttachment({
    _id: new Types.ObjectId(),
    legacyId: 9,
    title: 'Scope.pdf',
    url: 'https://cdn.example.com/scope.pdf',
    mimeType: 'application/pdf',
    size: '1024',
    isDeleted: false,
  }, projectId);

  assert.equal(result.payload.projectId.toString(), projectId.toString());
  assert.equal(result.payload.fileName, 'Scope.pdf');
  assert.equal(result.payload.fileUrl, 'https://cdn.example.com/scope.pdf');
  assert.equal(result.payload.fileType, 'application/pdf');
  assert.equal(result.payload.fileSize, 1024);
});

test('transformLegacyProjectAttachment rejects missing url', () => {
  const result = transformLegacyProjectAttachment({
    title: 'Missing URL',
    url: '',
  }, new Types.ObjectId());

  assert.equal(result.error.code, 'ATTACHMENT_URL_MISSING');
});
