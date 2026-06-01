const test = require('node:test');
const assert = require('node:assert/strict');
const { toUserDto, toUserSummaryDto } = require('../dto/user.dto');

const sampleUser = {
  _id: '665f1c2d3e4f5a6b7c8d9e0f',
  accountId: '665f1c2d3e4f5a6b7c8d9e0a',
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+10000000000',
  jobTitle: 'Engineer',
  department: 'Delivery',
  employmentType: 'full_time',
  status: 'active',
  managerId: null,
  notes: 'Internal admin note',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

test('toUserDto maps profile fields without password data', () => {
  const dto = toUserDto(sampleUser);
  assert.equal(dto.email, 'ada@example.com');
  assert.equal(dto.display_name, 'Ada Lovelace');
  assert.equal('password' in dto, false);
  assert.equal('passwordHash' in dto, false);
});

test('toUserSummaryDto excludes internal notes', () => {
  const dto = toUserSummaryDto(sampleUser);
  assert.equal(dto.display_name, 'Ada Lovelace');
  assert.equal(dto.job_title, 'Engineer');
  assert.equal('notes' in dto, false);
  assert.equal('account_id' in dto, false);
});
