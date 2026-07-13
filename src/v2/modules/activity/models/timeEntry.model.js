const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { ENTRY_STATUSES, ENTRY_SOURCES } = require('../constants/activity.constants');

const TimeEntrySchema = new Schema(
  {
    timeWeekId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsTimeWeek',
      required: true,
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
      index: true,
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
      index: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    workCategoryId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsWorkCategory',
      required: true,
      index: true,
    },
    entryDate: { type: Date, required: true, index: true },
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    minutes: { type: Number, required: true, min: 1 },
    title: { type: String, default: null, trim: true },
    description: { type: String, default: null, trim: true },
    source: {
      type: String,
      enum: ENTRY_SOURCES,
      default: 'manual',
    },
    status: {
      type: String,
      enum: ENTRY_STATUSES,
      default: 'draft',
      index: true,
    },
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    billable: { type: Boolean, default: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_time_entries',
    timestamps: true,
  }
);

TimeEntrySchema.index({ createdAt: -1 });
TimeEntrySchema.index({ timeWeekId: 1, entryDate: 1 });
TimeEntrySchema.index({ userId: 1, entryDate: 1 });
TimeEntrySchema.index({ assignmentId: 1, isDeleted: 1, status: 1 });
TimeEntrySchema.index({ projectId: 1, userId: 1, entryDate: -1, isDeleted: 1 });

async function ensureTimeEntryIndexes() {
  const TimeEntry = getV2Model('PtsTimeEntry', TimeEntrySchema);
  await TimeEntry.createIndexes();
  return TimeEntry;
}

module.exports = {
  TimeEntrySchema,
  ensureTimeEntryIndexes,
  getTimeEntryModel: () => getV2Model('PtsTimeEntry', TimeEntrySchema),
};
