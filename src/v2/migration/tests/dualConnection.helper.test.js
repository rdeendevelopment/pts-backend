const { test } = require('node:test');
const assert = require('node:assert/strict');

test('dualConnection rejects missing MONGO_V2_DB for target seed', async () => {
  const saved = process.env.MONGO_V2_DB;
  delete process.env.MONGO_V2_DB;

  delete require.cache[require.resolve('../../../../config/constants')];
  delete require.cache[require.resolve('../helpers/dualConnection.helper')];
  const { connectTargetForSeed } = require('../helpers/dualConnection.helper');

  await assert.rejects(
    () => connectTargetForSeed(),
    /MONGO_V2_DB is required/
  );

  process.env.MONGO_V2_DB = saved;
});

test('dualConnection rejects identical source and target DB names', async () => {
  const savedV2 = process.env.MONGO_V2_DB;
  const savedDb = process.env.MONGO_DB;

  process.env.MONGO_DB = 'same_db';
  process.env.MONGO_V2_DB = 'same_db';

  delete require.cache[require.resolve('../../../../config/constants')];
  delete require.cache[require.resolve('../helpers/dualConnection.helper')];
  const { connectTargetDb } = require('../helpers/dualConnection.helper');

  await assert.rejects(
    () => connectTargetDb(),
    /must differ from MONGO_DB/
  );

  process.env.MONGO_V2_DB = savedV2;
  process.env.MONGO_DB = savedDb;
});
