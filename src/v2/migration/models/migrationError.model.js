const { Schema } = require('mongoose');

const MIGRATION_ERROR_STATUSES = ['error', 'resolved'];

const MigrationErrorSchema = new Schema(
  {
    runId: { type: Schema.Types.ObjectId, ref: 'PtsMigrationRun', required: true, index: true },
    entityType: { type: String, required: true, index: true },
    oldCollection: { type: String, required: true },
    oldId: { type: Number, default: null },
    oldObjectId: { type: Schema.Types.ObjectId, default: null },
    status: {
      type: String,
      enum: MIGRATION_ERROR_STATUSES,
      default: 'error',
      index: true,
    },
    error: {
      code: { type: String, required: true },
      message: { type: String, required: true },
      details: { type: Schema.Types.Mixed, default: null },
    },
    sourceSnapshot: { type: Schema.Types.Mixed, default: null },
    migratedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedByRunId: { type: Schema.Types.ObjectId, ref: 'PtsMigrationRun', default: null },
  },
  {
    collection: 'pts_migration_errors',
    timestamps: true,
  }
);

MigrationErrorSchema.index({ runId: 1, entityType: 1, status: 1 });

function getMigrationErrorModel(connection) {
  if (!connection) {
    throw new Error('Migration models require a mongoose connection.');
  }
  return connection.models.PtsMigrationError
    || connection.model('PtsMigrationError', MigrationErrorSchema);
}

module.exports = {
  MigrationErrorSchema,
  MIGRATION_ERROR_STATUSES,
  getMigrationErrorModel,
};
