#!/usr/bin/env node
require('dotenv').config();

const { closeMigrationConnections } = require('../src/v2/migration/helpers/dualConnection.helper');
const { repairSqlPhase1UsersAndAssignments } = require('../src/v2/migration/sql/services/phase1Migration.service');

async function main() {
  const file = process.argv[2] || '/Users/uilyas/office/projects/pts/legacy/u185411446_prodpts.sql';
  const priorRunId = process.argv[3] || '6a1f18d3eb5673cabf37b09d';

  const report = await repairSqlPhase1UsersAndAssignments({ file, priorRunId, verbose: true });
  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

main()
  .catch((err) => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  })
  .finally(() => closeMigrationConnections());
