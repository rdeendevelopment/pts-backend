#!/usr/bin/env node
require('dotenv').config();

const { info, error } = require('../../kernel/logger');
const { closeMigrationConnections } = require('../helpers/dualConnection.helper');
const { seedCore } = require('./seedCore');
const { seedSuperAdmin } = require('./seedSuperAdmin');

async function main() {
  info('Starting PTS v2 seed', {
    targetDb: process.env.MONGO_V2_DB,
    sourceDb: process.env.MONGO_DB,
  });

  const coreSummary = await seedCore();
  const adminSummary = await seedSuperAdmin();

  info('PTS v2 seed completed', {
    core: coreSummary,
    superAdmin: adminSummary,
  });

  console.log(JSON.stringify({ ok: true, core: coreSummary, superAdmin: adminSummary }, null, 2));
}

main()
  .catch((err) => {
    error('PTS v2 seed failed', { message: err.message, stack: err.stack });
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMigrationConnections();
  });
