const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { WEEK_STATUSES } = require('../constants/activity.constants');
const { getBusinessTimezone } = require('../helpers/week.helper');

const TimeWeekSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      required: true,
      index: true,
    },
    weekStartDate: { type: Date, required: true, index: true },
    weekEndDate: { type: Date, required: true },
    timezone: { type: String, default: getBusinessTimezone },
    status: {
      type: String,
      enum: WEEK_STATUSES,
      default: 'draft',
      index: true,
    },
    totalMinutes: { type: Number, default: 0, min: 0 },
    totalEntries: { type: Number, default: 0, min: 0 },
    submittedAt: { type: Date, default: null },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    rejectionReason: { type: String, default: null },
    lockedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_time_weeks',
    timestamps: true,
  }
);

TimeWeekSchema.index(
  { userId: 1, weekStartDate: 1 },
  {
    unique: true,
    name: 'pts_time_weeks_user_week_start_unique_active',
    partialFilterExpression: { isDeleted: false },
  }
);

async function ensureTimeWeekIndexes() {
  const TimeWeek = getV2Model('PtsTimeWeek', TimeWeekSchema);
  await TimeWeek.createIndexes();
  return TimeWeek;
}

module.exports = {
  TimeWeekSchema,
  ensureTimeWeekIndexes,
  getTimeWeekModel: () => getV2Model('PtsTimeWeek', TimeWeekSchema),
};
