const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const END_DAY_REPORT_STATUSES = ['submitted', 'ended'];

const DailyFlowEndDayReportSchema = new Schema(
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
    status: {
      type: String,
      enum: END_DAY_REPORT_STATUSES,
      default: 'submitted',
      index: true,
    },
    submittedAt: {
      type: Date,
      default: null,
      index: true,
    },
    completedWorkItems: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    completedLinkedTasks: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    pendingWorkItems: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    blockers: { type: String, default: null, trim: true },
    tomorrowPlan: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true },
    totalActivityMinutes: { type: Number, default: 0, min: 0 },
    personalGoalsCount: { type: Number, default: 0, min: 0 },
    completedPersonalGoalsCount: { type: Number, default: 0, min: 0 },
    catchupsSummary: {
      type: Schema.Types.Mixed,
      default: null,
    },
    aiSummary: { type: String, default: null, trim: true },
    aiFallbackUsed: { type: Boolean, default: false },
    hasChangesAfterSubmission: { type: Boolean, default: false },
    changedItemsCount: { type: Number, default: 0, min: 0 },
    lastChangedGoalId: { type: String, default: null, trim: true },
    lastChangedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_daily_flow_end_day_reports',
    timestamps: true,
  }
);

DailyFlowEndDayReportSchema.index(
  { accountId: 1, dayKey: 1 },
  {
    unique: true,
    name: 'pts_daily_flow_end_day_reports_account_day_unique',
    partialFilterExpression: { isDeleted: false },
  }
);

DailyFlowEndDayReportSchema.index({ dayKey: 1, submittedAt: -1 });
DailyFlowEndDayReportSchema.index({ userId: 1, dayKey: 1 });

async function ensureDailyFlowEndDayReportIndexes() {
  const Model = getV2Model('PtsDailyFlowEndDayReport', DailyFlowEndDayReportSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  END_DAY_REPORT_STATUSES,
  DailyFlowEndDayReportSchema,
  ensureDailyFlowEndDayReportIndexes,
  getDailyFlowEndDayReportModel: () => getV2Model('PtsDailyFlowEndDayReport', DailyFlowEndDayReportSchema),
};
