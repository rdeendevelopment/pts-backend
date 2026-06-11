const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  GOAL_TYPES,
  GOAL_STATUSES,
  GOAL_SOURCE_TYPES,
  GOAL_VISIBILITY,
} = require('../constants/dailyFlow.constants');

const DailyFlowGoalSchema = new Schema(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      default: null,
      index: true,
    },
    dayId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsDailyFlowDay',
      default: null,
      index: true,
    },
    dayKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    dueDate: {
      type: String,
      default: null,
      trim: true,
    },
    type: {
      type: String,
      enum: GOAL_TYPES,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: { type: String, default: null, trim: true },
    category: { type: String, default: null, trim: true, index: true },
    targetValue: { type: Number, default: null, min: 0 },
    currentValue: { type: Number, default: 0, min: 0 },
    unit: { type: String, default: null, trim: true },
    visibility: {
      type: String,
      enum: GOAL_VISIBILITY,
      default: 'private',
    },
    sourceType: {
      type: String,
      enum: GOAL_SOURCE_TYPES,
      default: 'manual',
      index: true,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    linkedTaskId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsTask',
      default: null,
      index: true,
    },
    syncTaskStatus: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: GOAL_STATUSES,
      default: 'pending',
      index: true,
    },
    isPrivate: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_daily_flow_goals',
    timestamps: true,
  }
);

DailyFlowGoalSchema.index({ accountId: 1, dayKey: 1, sortOrder: 1 });
DailyFlowGoalSchema.index({ accountId: 1, type: 1, status: 1 });
DailyFlowGoalSchema.index(
  { accountId: 1, dayKey: 1, linkedTaskId: 1 },
  {
    unique: true,
    name: 'pts_daily_flow_goals_account_day_linked_task_unique',
    partialFilterExpression: {
      isDeleted: false,
      linkedTaskId: { $type: 'objectId' },
    },
  }
);

async function ensureDailyFlowGoalIndexes() {
  const Model = getV2Model('PtsDailyFlowGoal', DailyFlowGoalSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DailyFlowGoalSchema,
  ensureDailyFlowGoalIndexes,
  getDailyFlowGoalModel: () => getV2Model('PtsDailyFlowGoal', DailyFlowGoalSchema),
};
