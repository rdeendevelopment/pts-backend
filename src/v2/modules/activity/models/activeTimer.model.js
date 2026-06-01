const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { TIMER_STATUSES } = require('../constants/activity.constants');

const ActiveTimerSchema = new Schema(
  {
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsClient',
      default: null,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProjectAssignment',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      required: true,
      index: true,
    },
    budgetId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProjectBudget',
      default: null,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    taskKey: {
      type: String,
      default: 'NO_TASK',
      index: true,
    },
    workCategoryId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsWorkCategory',
      required: true,
    },
    startedAt: { type: Date, required: true, index: true },
    sessionStartedAt: { type: Date, default: null },
    accumulatedSeconds: { type: Number, default: 0, min: 0 },
    pausedAt: { type: Date, default: null },
    stoppedAt: { type: Date, default: null },
    description: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: TIMER_STATUSES,
      default: 'running',
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_active_timers',
    timestamps: true,
  }
);

ActiveTimerSchema.index(
  { userId: 1 },
  {
    unique: true,
    name: 'pts_active_timers_user_running_unique',
    partialFilterExpression: { status: 'running', isDeleted: false },
  }
);

ActiveTimerSchema.index(
  {
    userId: 1,
    clientId: 1,
    projectId: 1,
    workCategoryId: 1,
    taskKey: 1,
  },
  {
    unique: true,
    name: 'pts_active_timers_user_context_open_unique',
    partialFilterExpression: {
      status: { $in: ['running', 'paused'] },
      isDeleted: false,
    },
  }
);

ActiveTimerSchema.index(
  { userId: 1, status: 1, pausedAt: -1 },
  { name: 'pts_active_timers_user_paused_list' },
);

async function ensureActiveTimerIndexes() {
  const { migrateActiveTimerIndexes } = require('../scripts/migrateActiveTimerIndexes');
  await migrateActiveTimerIndexes();
  return getV2Model('PtsActiveTimer', ActiveTimerSchema);
}

module.exports = {
  ActiveTimerSchema,
  ensureActiveTimerIndexes,
  getActiveTimerModel: () => getV2Model('PtsActiveTimer', ActiveTimerSchema),
};
