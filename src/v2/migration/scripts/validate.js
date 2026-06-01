#!/usr/bin/env node
require('dotenv').config();

const { MONGO_V2_DB } = require('../../../../config/constants');
const {
  connectTargetForSeed,
  closeMigrationConnections,
} = require('../helpers/dualConnection.helper');
const { ensureMigrationIndexes, getMigrationRunModel } = require('../models');
const { getModuleModel } = require('../../modules/modules/models/module.model');
const { getAccountModel } = require('../../modules/auth/models/account.model');

async function main() {
  const connection = await connectTargetForSeed();
  await ensureMigrationIndexes(connection);

  const Module = getModuleModel();
  const Account = getAccountModel();
  const MigrationRun = getMigrationRunModel(connection);

  const [moduleCount, accountCount, runCount] = await Promise.all([
    Module.countDocuments({ isDeleted: false }),
    Account.countDocuments({ isDeleted: false }),
    MigrationRun.countDocuments({}),
  ]);

  const checks = [
    { name: 'target_db', ok: Boolean(MONGO_V2_DB), detail: MONGO_V2_DB || 'missing' },
    { name: 'pts_modules', ok: moduleCount > 0, detail: moduleCount },
    { name: 'pts_accounts', ok: accountCount > 0, detail: accountCount },
    { name: 'migration_runs_accessible', ok: runCount >= 0, detail: runCount },
  ];

  const passed = checks.every((check) => check.ok);
  const result = {
    ok: passed,
    targetDb: MONGO_V2_DB,
    checks,
    message: passed
      ? 'Foundation validation passed.'
      : 'Foundation validation failed — run npm run v2:seed on an empty v2 database.',
  };

  console.log(JSON.stringify(result, null, 2));
  if (!passed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMigrationConnections();
  });
