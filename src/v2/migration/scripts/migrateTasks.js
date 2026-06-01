#!/usr/bin/env node
require('dotenv').config();

const { parseCliArgs, closeMigrationConnections } = require('../helpers/cli.helper');
const { migrateTasks } = require('../services/taskMigration.service');

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const result = await migrateTasks({
    mode: args.mode || 'dry-run',
    batchSize: Number(args.batchSize || 500),
    startedBy: 'migrateTasks',
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
}).finally(() => closeMigrationConnections());
