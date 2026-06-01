#!/usr/bin/env node
require('dotenv').config();

const { parseCliArgs, closeMigrationConnections } = require('../helpers/cli.helper');
const { recalculateAllProjectBudgets } = require('../services/projectRecalculate.service');

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const result = await recalculateAllProjectBudgets({
    mode: args.mode || 'dry-run',
    batchSize: Number(args.batchSize || 500),
    startedBy: 'recalculateProjectBudgets',
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
}).finally(() => closeMigrationConnections());
