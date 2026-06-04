#!/usr/bin/env node
/**
 * Phase 2: Import legacy working_hours + daily_notes into V2 activity collections.
 *
 * Usage:
 *   node migrate-phase2.js --file=./path/to/dump.sql --dryRun=true --mode=insert-only
 *   npm run migrate:phase2 -- --file=../legacy/u185411446_prodpts.sql --dryRun=false
 */
require('dotenv').config();

const path = require('path');
const { parsePhase2CliArgs } = require('./src/v2/migration/sql/helpers/phase2Cli.helper');
const { runSqlPhase2Migration } = require('./src/v2/migration/sql/services/phase2Migration.service');
const { closeMigrationConnections } = require('./src/v2/migration/helpers/cli.helper');

async function main() {
  const args = parsePhase2CliArgs(process.argv.slice(2));
  const filePath = args.file
    ? path.resolve(process.cwd(), args.file)
    : path.resolve(__dirname, '../../legacy/u185411446_prodpts.sql');

  const report = await runSqlPhase2Migration({
    file: filePath,
    dryRun: args.dryRun,
    reset: args.reset,
    runId: args.runId,
    verbose: args.verbose,
    mode: args.mode,
    resume: args.resume,
    batchSize: args.batchSize,
  });

  if (process.env.JSON_REPORT === '1') {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exitCode = 1;
}).finally(() => closeMigrationConnections());
