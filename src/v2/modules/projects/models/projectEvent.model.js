const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const ProjectEventSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    eventType: { type: String, required: true, trim: true, index: true },
    title: { type: String, default: null, trim: true },
    description: { type: String, default: null, trim: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  {
    collection: 'pts_project_events',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

ProjectEventSchema.index({ projectId: 1, createdAt: -1 });

async function ensureProjectEventIndexes() {
  const ProjectEvent = getV2Model('PtsProjectEvent', ProjectEventSchema);
  await ProjectEvent.createIndexes();
  return ProjectEvent;
}

module.exports = {
  ProjectEventSchema,
  ensureProjectEventIndexes,
  getProjectEventModel: () => getV2Model('PtsProjectEvent', ProjectEventSchema),
};
