#!/usr/bin/env node
require('dotenv').config();

const { parseCliArgs, closeMigrationConnections } = require('../helpers/cli.helper');
const { migrateUsers } = require('../services/userMigration.service');

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const mode = args.mode || 'dry-run';
  const batchSize = Number(args.batchSize || 500);

  const result = await migrateUsers({
    mode,
    batchSize,
    startedBy: 'migrateUsers',
    notes: `Phase 2 users migration (${mode})`,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
}).finally(() => closeMigrationConnections());
