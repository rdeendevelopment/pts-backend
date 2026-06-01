const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const ProjectStatsSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      unique: true,
    },
    totalApprovedMinutes: { type: Number, default: 0, min: 0 },
    totalApprovedAmount: { type: Number, default: 0, min: 0 },
    totalPendingMinutes: { type: Number, default: 0, min: 0 },
    totalPendingAmount: { type: Number, default: 0, min: 0 },
    totalAssignedMinutes: { type: Number, default: 0, min: 0 },
    totalConsumedMinutes: { type: Number, default: 0, min: 0 },
    totalRemainingMinutes: { type: Number, default: 0, min: 0 },
    totalAvailableToAssignMinutes: { type: Number, default: 0, min: 0 },
    totalMembers: { type: Number, default: 0, min: 0 },
    totalBudgets: { type: Number, default: 0, min: 0 },
    totalFiles: { type: Number, default: 0, min: 0 },
    lastActivityAt: { type: Date, default: null },
    recalculatedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_project_stats',
    timestamps: true,
  }
);

ProjectStatsSchema.index({ projectId: 1 }, { unique: true, name: 'pts_project_stats_project_unique' });

async function ensureProjectStatsIndexes() {
  const ProjectStats = getV2Model('PtsProjectStats', ProjectStatsSchema);
  await ProjectStats.createIndexes();
  return ProjectStats;
}

module.exports = {
  ProjectStatsSchema,
  ensureProjectStatsIndexes,
  getProjectStatsModel: () => getV2Model('PtsProjectStats', ProjectStatsSchema),
};
