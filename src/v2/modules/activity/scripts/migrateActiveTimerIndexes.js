#!/usr/bin/env node
/**
 * Safe migration for pts_active_timers indexes.
 * Run: npm run v2:migrate:timer-indexes
 */
const { toTaskKey } = require('../helpers/timerContext.helper');

const DROP_INDEX_NAMES = [
  'pts_active_timers_user_active_unique',
];

async function backfillTaskKeys(ActiveTimer) {
  const timers = await ActiveTimer.find({
    $or: [{ taskKey: { $exists: false } }, { taskKey: null }, { taskKey: '' }],
  }).select('_id taskId').lean();

  let updated = 0;
  for (const timer of timers) {
    await ActiveTimer.updateOne(
      { _id: timer._id },
      { $set: { taskKey: toTaskKey(timer.taskId) } },
    );
    updated += 1;
  }
  if (updated > 0) {
    console.log(`[TIMER INDEX] backfilled taskKey on ${updated} timer(s)`);
  }
}

async function dropLegacyIndexes(collection) {
  const indexes = await collection.indexes();
  for (const idx of indexes) {
    const name = idx.name;
    if (name === '_id_') continue;
    if (!DROP_INDEX_NAMES.includes(name)) continue;
    await collection.dropIndex(name);
    console.log(`[TIMER INDEX] dropped old index ${name}`);
  }
}

async function migrateActiveTimerIndexes() {
  const { getActiveTimerModel } = require('../models/activeTimer.model');
  const ActiveTimer = getActiveTimerModel();
  const collection = ActiveTimer.collection;

  await backfillTaskKeys(ActiveTimer);
  await dropLegacyIndexes(collection);

  await ActiveTimer.createIndexes();
  console.log('[TIMER INDEX] created running unique index');
  console.log('[TIMER INDEX] created context unique index');
  console.log('[TIMER INDEX] migration complete');
}

async function runCli() {
  require('dotenv').config();
  const { connectV2Database, closeV2Database } = require('../../../database/connection');

  try {
    await connectV2Database();
    await migrateActiveTimerIndexes();
    process.exitCode = 0;
  } catch (err) {
    console.error('[TIMER INDEX] migration failed', err);
    process.exitCode = 1;
  } finally {
    await closeV2Database().catch(() => {});
    process.exit(process.exitCode ?? 0);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = { migrateActiveTimerIndexes };
