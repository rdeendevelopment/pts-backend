const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  CATCHUP_TYPES,
  CATCHUP_STATUSES,
  CATCHUP_PRIORITIES,
} = require('../constants/dailyFlow.constants');

const DailyFlowCatchupSchema = new Schema(
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
    type: {
      type: String,
      enum: CATCHUP_TYPES,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: { type: String, default: null, trim: true },
    priority: {
      type: String,
      enum: CATCHUP_PRIORITIES,
      default: 'medium',
      index: true,
    },
    dueDate: { type: String, default: null, trim: true },
    linkedProjectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      default: null,
      index: true,
    },
    linkedTaskId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsTask',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: CATCHUP_STATUSES,
      default: 'open',
      index: true,
    },
    withAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      default: null,
      index: true,
    },
    resolvedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_daily_flow_catchups',
    timestamps: true,
  }
);

DailyFlowCatchupSchema.index({ accountId: 1, dayKey: 1, status: 1 });
DailyFlowCatchupSchema.index({ accountId: 1, type: 1, updatedAt: -1 });

async function ensureDailyFlowCatchupIndexes() {
  const Model = getV2Model('PtsDailyFlowCatchup', DailyFlowCatchupSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DailyFlowCatchupSchema,
  ensureDailyFlowCatchupIndexes,
  getDailyFlowCatchupModel: () => getV2Model('PtsDailyFlowCatchup', DailyFlowCatchupSchema),
};
