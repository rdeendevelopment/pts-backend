#!/usr/bin/env node
require('dotenv').config();

const { parseCliArgs, closeMigrationConnections } = require('../helpers/cli.helper');
const { migrateAll } = require('../services/fullMigration.service');

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const mode = args.mode || 'dry-run';
  const batchSize = Number(args.batchSize || 500);
  const steps = args.step ? String(args.step).split(',').map((s) => s.trim()) : null;

  const result = await migrateAll({
    mode,
    batchSize,
    startedBy: 'migrateAll',
    steps,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
}).finally(() => closeMigrationConnections());
