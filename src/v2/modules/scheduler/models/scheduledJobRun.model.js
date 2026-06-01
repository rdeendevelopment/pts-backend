const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const ScheduledJobRunSchema = new Schema(
  {
    jobName: { type: String, required: true, index: true },
    trigger: { type: String, default: 'agenda', index: true },
    status: {
      type: String,
      enum: ['running', 'completed', 'completed_with_errors', 'failed', 'skipped'],
      default: 'running',
      index: true,
    },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    agendaJobId: { type: Schema.Types.ObjectId, default: null, index: true },
  },
  {
    collection: 'pts_scheduled_job_runs',
    timestamps: true,
  },
);

ScheduledJobRunSchema.index({ jobName: 1, startedAt: -1 });

async function ensureScheduledJobRunIndexes() {
  const ScheduledJobRun = getV2Model('PtsScheduledJobRun', ScheduledJobRunSchema);
  await ScheduledJobRun.createIndexes();
  return ScheduledJobRun;
}

module.exports = {
  ScheduledJobRunSchema,
  ensureScheduledJobRunIndexes,
  getScheduledJobRunModel: () => getV2Model('PtsScheduledJobRun', ScheduledJobRunSchema),
};
