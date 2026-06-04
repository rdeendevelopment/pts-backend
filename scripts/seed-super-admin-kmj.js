#!/usr/bin/env node
require('dotenv').config();

const { closeMigrationConnections } = require('../src/v2/migration/helpers/dualConnection.helper');
const { seedSuperAdmin } = require('../src/v2/migration/seed/seedSuperAdmin');

async function main() {
  process.env.PTS_V2_SEED_ADMIN_EMAIL = process.env.PTS_V2_SEED_ADMIN_EMAIL || 'admin@kmj.vegas';
  process.env.PTS_V2_SEED_ADMIN_PASSWORD = process.env.PTS_V2_SEED_ADMIN_PASSWORD || 'imadmin';
  process.env.PTS_V2_SEED_ADMIN_FIRST_NAME = process.env.PTS_V2_SEED_ADMIN_FIRST_NAME || 'admin';
  process.env.PTS_V2_SEED_ADMIN_LAST_NAME = process.env.PTS_V2_SEED_ADMIN_LAST_NAME || 'Admin';
  process.env.PTS_V2_SEED_ADMIN_USERNAME = process.env.PTS_V2_SEED_ADMIN_USERNAME || 'admin';

  const summary = await seedSuperAdmin();
  console.log(JSON.stringify({ ok: true, superAdmin: summary }, null, 2));
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => closeMigrationConnections());
