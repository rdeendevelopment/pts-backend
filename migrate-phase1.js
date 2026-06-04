#!/usr/bin/env node
/**
 * Phase 1: Import legacy MySQL SQL dump into MongoDB V2 (demo_pts_prod_v2).
 *
 * Usage:
 *   node migrate-phase1.js --file=./path/to/dump.sql --dryRun=true --reset=false --verbose=true
 *   npm run migrate:phase1 -- --file=../legacy/u185411446_prodpts.sql --dryRun=true
 */
require('dotenv').config();

const path = require('path');
const { parsePhase1CliArgs } = require('./src/v2/migration/sql/helpers/sqlPhase1Cli.helper');
const { runSqlPhase1Migration } = require('./src/v2/migration/sql/services/phase1Migration.service');
const { closeMigrationConnections } = require('./src/v2/migration/helpers/cli.helper');

async function main() {
  const args = parsePhase1CliArgs(process.argv.slice(2));
  const filePath = args.file
    ? path.resolve(process.cwd(), args.file)
    : path.resolve(__dirname, '../../legacy/u185411446_prodpts.sql');

  const report = await runSqlPhase1Migration({
    file: filePath,
    dryRun: args.dryRun,
    reset: args.reset,
    runId: args.runId,
    verbose: args.verbose,
  });

  if (process.env.JSON_REPORT === '1') {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exitCode = 1;
}).finally(() => closeMigrationConnections());
