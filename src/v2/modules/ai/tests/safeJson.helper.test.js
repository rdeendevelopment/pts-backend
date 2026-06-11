const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { safeParseJson, stripCodeFences } = require('../helpers/safeJson.helper');

describe('safeJson.helper', () => {
  it('parses plain JSON', () => {
    assert.deepEqual(safeParseJson('{"a":1}'), { a: 1 });
  });

  it('strips fenced JSON', () => {
    const raw = '```json\n{"summary":"ok"}\n```';
    assert.equal(stripCodeFences(raw), '{"summary":"ok"}');
    assert.deepEqual(safeParseJson(raw), { summary: 'ok' });
  });

  it('returns fallback on invalid JSON', () => {
    assert.equal(safeParseJson('not json', null), null);
  });
});
