const { Schema } = require('mongoose');

const MIGRATION_MODES = ['dry-run', 'live', 'resume'];
const MIGRATION_RUN_STATUSES = ['pending', 'running', 'completed', 'failed', 'rolled_back'];

const MigrationStepSchema = new Schema(
  {
    entityType: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
      default: 'pending',
    },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    sourceCount: { type: Number, default: 0 },
    insertedCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const MigrationRunSchema = new Schema(
  {
    mode: { type: String, enum: MIGRATION_MODES, required: true },
    status: {
      type: String,
      enum: MIGRATION_RUN_STATUSES,
      default: 'pending',
      index: true,
    },
    sourceDb: { type: String, required: true },
    targetDb: { type: String, required: true },
    steps: { type: [MigrationStepSchema], default: [] },
    options: {
      batchSize: { type: Number, default: 500 },
      skipDeleted: { type: Boolean, default: true },
      weekStartDay: { type: String, default: 'monday' },
      businessTimezone: { type: String, default: 'UTC' },
    },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    startedBy: { type: String, default: 'script' },
    notes: { type: String, default: null },
  },
  {
    collection: 'pts_migration_runs',
    timestamps: true,
  }
);

MigrationRunSchema.index({ createdAt: -1 });

function getMigrationRunModel(connection) {
  if (!connection) {
    throw new Error('Migration models require a mongoose connection.');
  }
  return connection.models.PtsMigrationRun
    || connection.model('PtsMigrationRun', MigrationRunSchema);
}

module.exports = {
  MigrationRunSchema,
  MIGRATION_MODES,
  MIGRATION_RUN_STATUSES,
  getMigrationRunModel,
};
