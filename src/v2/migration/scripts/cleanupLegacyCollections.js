#!/usr/bin/env node
/**
 * Remove legacy (non-pts_*) collections accidentally present in MONGO_V2_DB.
 *
 * Usage:
 *   npm run v2:cleanup:legacy-collections          # dry-run (default)
 *   npm run v2:cleanup:legacy-collections:live     # drop collections
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { MONGO_V2_DB } = require('../../../../config/constants');
const {
  connectTargetForSeed,
  closeMigrationConnections,
} = require('../helpers/dualConnection.helper');
const { parseCliArgs } = require('../helpers/cli.helper');

const REPORT_DIR = path.join(__dirname, '..', 'reports');

function isV2Collection(name) {
  return String(name).startsWith('pts_');
}

async function listCollections(db) {
  return (await db.listCollections().toArray())
    .map((row) => row.name)
    .sort();
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const live = args.mode === 'live';

  if (!MONGO_V2_DB) {
    throw new Error('MONGO_V2_DB is not configured.');
  }

  const connection = await connectTargetForSeed();
  const db = connection.getClient().db(MONGO_V2_DB);
  const all = await listCollections(db);
  const keep = all.filter(isV2Collection);
  const remove = all.filter((name) => !isV2Collection(name));

  const summary = {
    ok: true,
    mode: live ? 'live' : 'dry-run',
    targetDb: MONGO_V2_DB,
    totalCollections: all.length,
    keepCount: keep.length,
    removeCount: remove.length,
    keep,
    remove,
    dropped: [],
    errors: [],
  };

  if (live && remove.length) {
    for (const name of remove) {
      try {
        await db.collection(name).drop();
        summary.dropped.push(name);
      } catch (err) {
        summary.errors.push({ collection: name, message: err.message });
        summary.ok = false;
      }
    }
  }

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORT_DIR, `legacy-cleanup-${live ? 'live' : 'dry-run'}-${stamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(JSON.stringify({
    ...summary,
    reportPath,
    message: live
      ? (summary.dropped.length
        ? `Dropped ${summary.dropped.length} legacy collection(s) from ${MONGO_V2_DB}.`
        : 'No legacy collections to drop.')
      : `Dry-run: ${remove.length} legacy collection(s) would be dropped from ${MONGO_V2_DB}. Re-run with --mode=live to apply.`,
  }, null, 2));

  if (summary.errors.length) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMigrationConnections().catch(() => {});
  });
