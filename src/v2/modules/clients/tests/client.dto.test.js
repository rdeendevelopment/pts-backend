const test = require('node:test');
const assert = require('node:assert/strict');
const { toClientDto } = require('../dto/client.dto');

const sampleClient = {
  _id: '665f1c2d3e4f5a6b7c8d9e0f',
  name: 'Acme Corp',
  normalizedName: 'acme corp',
  code: 'ACME_CORP',
  type: 'business',
  status: 'active',
  schemaVersion: 1,
  isDeleted: false,
  deletedAt: null,
  tags: ['enterprise'],
  createdBy: '665f1c2d3e4f5a6b7c8d9e0a',
  updatedBy: '665f1c2d3e4f5a6b7c8d9e0a',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

test('toClientDto excludes internal normalizedName and delete flags', () => {
  const dto = toClientDto(sampleClient);
  assert.equal(dto.name, 'Acme Corp');
  assert.equal(dto.code, 'ACME_CORP');
  assert.equal('normalizedName' in dto, false);
  assert.equal('normalized_name' in dto, false);
  assert.equal('is_deleted' in dto, false);
  assert.equal('schema_version' in dto, false);
});
