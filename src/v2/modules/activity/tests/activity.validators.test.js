const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const { weekListRules } = require('../validators/activity.validators');

async function validateStatus(status) {
  const req = { query: { status } };
  await Promise.all(weekListRules.map((rule) => rule.run(req)));
  return validationResult(req);
}

test('week list accepts a safe comma-separated status filter', async () => {
  const result = await validateStatus('submitted,approved,rejected');
  assert.equal(result.isEmpty(), true);
});

test('week list rejects unknown statuses in a combined filter', async () => {
  const result = await validateStatus('submitted,invalid');
  assert.equal(result.isEmpty(), false);
});

test('week list keeps all as a standalone status only', async () => {
  assert.equal((await validateStatus('all')).isEmpty(), true);
  assert.equal((await validateStatus('all,submitted')).isEmpty(), false);
});
