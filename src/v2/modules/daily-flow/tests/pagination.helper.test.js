const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseDashboardGoalsLimit,
  parseDashboardCatchupsLimit,
  parseListLimit,
} = require('../helpers/pagination.helper');

test('dashboard limits default to 100 and cap at 200', () => {
  assert.equal(parseDashboardGoalsLimit(undefined), 100);
  assert.equal(parseDashboardGoalsLimit(150), 150);
  assert.equal(parseDashboardGoalsLimit(500), 200);
  assert.equal(parseDashboardCatchupsLimit(null), 100);
});

test('list limits use provided max', () => {
  assert.equal(parseListLimit(25, 50, 200), 25);
  assert.equal(parseListLimit(999, 50, 200), 200);
  assert.equal(parseListLimit('bad', 50, 200), 50);
});
