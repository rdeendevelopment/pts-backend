const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStatusMessage } = require('../helpers/example.helper');

test('buildStatusMessage includes module key', () => {
  assert.match(buildStatusMessage(), /example/);
});
