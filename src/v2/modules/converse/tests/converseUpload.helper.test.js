const test = require('node:test');
const assert = require('node:assert/strict');
const { saveUploadedFiles } = require('../../../kernel/helpers/localFileUpload.helper');

const options = {
  maxFiles: 10,
  maxSizeBytes: 200 * 1024 * 1024,
  allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx', 'txt', 'xlsx', 'mp4', 'webm', 'ogv', 'mov'],
};

test('Converse upload rejects executable and oversized files before saving', async () => {
  const unsafe = { name: 'script.html', size: 10, mv: () => { throw new Error('saved unsafe file'); } };
  const oversized = { name: 'large.pdf', size: options.maxSizeBytes + 1, mv: () => { throw new Error('saved oversized file'); } };
  await assert.rejects(saveUploadedFiles({ file: unsafe }, options), { status: 400 });
  await assert.rejects(saveUploadedFiles({ file: oversized }, options), { status: 400 });
});

test('Converse upload rejects more than ten files before saving', async () => {
  const files = Array.from({ length: 11 }, (_, index) => ({ name: `${index}.txt`, size: 1 }));
  await assert.rejects(saveUploadedFiles({ files }, options), { status: 400 });
});
