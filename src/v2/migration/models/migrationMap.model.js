const { Schema } = require('mongoose');

const MIGRATION_MAP_STATUSES = ['mapped', 'skipped', 'conflict', 'merged'];

const MigrationMapSchema = new Schema(
  {
    runId: { type: Schema.Types.ObjectId, ref: 'PtsMigrationRun', required: true, index: true },
    entityType: { type: String, required: true, index: true },
    oldCollection: { type: String, required: true },
    oldId: { type: Number, default: null, index: true },
    oldObjectId: { type: Schema.Types.ObjectId, default: null, index: true },
    newObjectId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: {
      type: String,
      enum: MIGRATION_MAP_STATUSES,
      default: 'mapped',
      index: true,
    },
    migratedAt: { type: Date, default: Date.now },
    metadata: {
      sourceHash: { type: String, default: null },
      transformVersion: { type: String, default: '1.0.0' },
    },
  },
  {
    collection: 'pts_migration_maps',
    timestamps: true,
  }
);

MigrationMapSchema.index(
  { entityType: 1, oldCollection: 1, oldObjectId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'mapped', oldObjectId: { $type: 'objectId' } },
  }
);

MigrationMapSchema.index({ entityType: 1, oldId: 1 });
MigrationMapSchema.index({ newObjectId: 1, entityType: 1 });

function getMigrationMapModel(connection) {
  if (!connection) {
    throw new Error('Migration models require a mongoose connection.');
  }
  return connection.models.PtsMigrationMap
    || connection.model('PtsMigrationMap', MigrationMapSchema);
}

module.exports = {
  MigrationMapSchema,
  MIGRATION_MAP_STATUSES,
  getMigrationMapModel,
};
