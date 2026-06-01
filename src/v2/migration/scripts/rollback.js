#!/usr/bin/env node
require('dotenv').config();

const { runFoundationDryRun, closeMigrationConnections } = require('../helpers/cli.helper');

async function main() {
  const result = await runFoundationDryRun({
    scriptName: 'rollback',
    notes: 'Rollback not implemented (Phase 1 foundation).',
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
}).finally(() => closeMigrationConnections());
