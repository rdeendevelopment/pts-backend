#!/usr/bin/env node
require('dotenv').config();

const path = require('path');
const { parsePhase1CliArgs } = require('../sql/helpers/sqlPhase1Cli.helper');
const { runSqlPhase1Migration } = require('../sql/services/phase1Migration.service');
const { closeMigrationConnections } = require('../helpers/cli.helper');

async function main() {
  const args = parsePhase1CliArgs(process.argv.slice(2));
  const defaultFile = path.resolve(__dirname, '../../../../../../legacy/u185411446_prodpts.sql');
  const filePath = args.file ? path.resolve(process.cwd(), args.file) : defaultFile;

  const report = await runSqlPhase1Migration({
    file: filePath,
    dryRun: args.dryRun,
    reset: args.reset,
    runId: args.runId,
    verbose: args.verbose,
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
}).finally(() => closeMigrationConnections());
