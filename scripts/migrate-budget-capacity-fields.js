/**
 * Backfill entryType + approvalStatus on pts_project_budgets.
 * Safe to run multiple times.
 *
 * Usage: node scripts/migrate-budget-capacity-fields.js
 */
const { getV2Connection } = require('../src/v2/database/connection');
const {
  syncBudgetCanonicalFields,
} = require('../src/v2/modules/projects/helpers/budgetCapacity.helper');

async function migrateBudgetCapacityFields() {
  const conn = await getV2Connection();
  const collection = conn.collection('pts_project_budgets');
  const cursor = collection.find({});
  let updated = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const synced = syncBudgetCanonicalFields(doc);
    const needsUpdate = synced.entryType !== doc.entryType
      || synced.approvalStatus !== doc.approvalStatus
      || synced.sourceType !== doc.sourceType
      || synced.status !== doc.status;

    if (needsUpdate) {
      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            entryType: synced.entryType,
            approvalStatus: synced.approvalStatus,
            sourceType: synced.sourceType,
            status: synced.status,
            schemaVersion: 2,
          },
        },
      );
      updated += 1;
    }
  }

  console.log(`Budget capacity migration complete. Updated ${updated} documents.`);
  await conn.close();
}

migrateBudgetCapacityFields().catch((error) => {
  console.error('Budget capacity migration failed:', error);
  process.exit(1);
});
