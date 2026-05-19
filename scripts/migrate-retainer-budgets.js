/**
 * Migration: Create missing retainer budgets for existing projects
 *
 * Finds all retainer/hybrid projects and ensures they have active monthly budgets.
 * Run this once to fix projects created before the budget normalization fix.
 *
 * Usage: node scripts/migrate-retainer-budgets.js
 */

const mongoose = require('mongoose');
const { connectMongo } = require('../config/mongo');

async function migrateRetainerBudgets() {
  try {
    await connectMongo();
    console.log('Connected to MongoDB');

    const { CoreProject, ProjectBudget } = require('../src/app/MongoModels');

    // Find all retainer/hybrid projects
    const retainerProjects = await CoreProject.find({
      $or: [
        { projectType: 'retainer' },
        { projectType: 'hybrid' },
        { isRetain: true },
      ],
      isDeleted: false,
    }).lean();

    console.log(`Found ${retainerProjects.length} retainer/hybrid projects`);

    let createdCount = 0;
    let skippedCount = 0;

    for (const project of retainerProjects) {
      const retainerHours = Number(project.retainerHoursPerMonth || 0);

      if (!retainerHours || retainerHours < 1) {
        console.log(`⊘ Skipping "${project.title}" - no retainer hours configured`);
        skippedCount++;
        continue;
      }

      // Check if project already has an active retainer budget for current month
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
      const monthLabel = monthStart.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

      const existingBudget = await ProjectBudget.findOne({
        projectId: project._id,
        budgetType: 'retainer',
        status: { $ne: 'cancelled' },
        $or: [
          { name: `${monthLabel} Retainer` },
          { startDate: { $lte: monthStart }, endDate: { $gte: monthStart } },
        ],
      }).lean();

      if (existingBudget) {
        console.log(`✓ "${project.title}" already has a budget for ${monthLabel}`);
        skippedCount++;
        continue;
      }

      // Get next legacy ID
      const lastBudget = await ProjectBudget.findOne({}, { legacyId: 1 }).sort({ legacyId: -1 }).lean();
      const nextLegacyId = Number(lastBudget?.legacyId || 0) + 1;

      // Create the missing budget
      await ProjectBudget.create({
        legacyId: nextLegacyId,
        projectId: project._id,
        name: `${monthLabel} Retainer`,
        description: `Monthly retainer bucket for ${monthLabel}`,
        budgetType: 'retainer',
        billingType: 'billable',
        allocatedMinutes: Math.round(retainerHours * 60),
        consumedMinutes: 0,
        startDate: monthStart.toISOString().slice(0, 10),
        endDate: monthEnd.toISOString().slice(0, 10),
        allowExceed: true,
        warningThresholdPercent: 80,
        status: 'active',
      });

      console.log(`✓ Created ${monthLabel} budget for "${project.title}" (${retainerHours}h)`);
      createdCount++;
    }

    console.log(`\n✓ Migration complete!`);
    console.log(`  Created: ${createdCount} budgets`);
    console.log(`  Skipped: ${skippedCount} projects`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

migrateRetainerBudgets();
