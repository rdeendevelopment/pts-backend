const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePagination,
  parseAggregateFilters,
  parseDueDateRange,
  buildPaginationMeta,
} = require('../helpers/taskAggregateQuery.helper');

test('parsePagination applies defaults and caps limit', () => {
  const result = parsePagination({}, { defaultLimit: 100 });
  assert.equal(result.page, 1);
  assert.equal(result.limit, 100);
  assert.equal(result.skip, 0);
});

test('parsePagination respects page and max limit', () => {
  const result = parsePagination({ page: '2', limit: '999' }, { defaultLimit: 50 });
  assert.equal(result.page, 2);
  assert.equal(result.limit, 200);
  assert.equal(result.skip, 200);
});

test('parseAggregateFilters maps query params', () => {
  const filters = parseAggregateFilters({
    projectId: '507f1f77bcf86cd799439011',
    status: 'active',
    priority: 'high',
    search: '  deploy  ',
  });

  assert.equal(String(filters.projectId), '507f1f77bcf86cd799439011');
  assert.equal(filters.status, 'active');
  assert.equal(filters.priority, 'high');
  assert.equal(filters.search, 'deploy');
});

test('parseDueDateRange accepts alternate param names', () => {
  const range = parseDueDateRange({
    dueDateStart: '2026-05-01T00:00:00.000Z',
    dueDateEnd: '2026-05-31T23:59:59.999Z',
  });

  assert.ok(range.from instanceof Date);
  assert.ok(range.to instanceof Date);
});

test('buildPaginationMeta computes totals', () => {
  const meta = buildPaginationMeta({ page: 2, limit: 25, total: 60 });
  assert.equal(meta.totalPages, 3);
  assert.equal(meta.hasMore, true);
});
