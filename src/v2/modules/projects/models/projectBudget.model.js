const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  BUDGET_ENTRY_TYPES,
  BUDGET_APPROVAL_STATUSES,
  BUDGET_SOURCE_TYPES,
  BUDGET_TYPES,
  BUDGET_STATUSES,
  DEFAULT_CURRENCY,
} = require('../constants/project.constants');

const ClientApprovalSchema = new Schema(
  {
    required: { type: Boolean, default: false },
    approvedByName: { type: String, default: null },
    approvedByEmail: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    notes: { type: String, default: null },
  },
  { _id: false }
);

const AdminApprovalSchema = new Schema(
  {
    required: { type: Boolean, default: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    approvedAt: { type: Date, default: null },
    notes: { type: String, default: null },
  },
  { _id: false }
);

const ProjectBudgetSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null, trim: true },
    entryType: {
      type: String,
      enum: BUDGET_ENTRY_TYPES,
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: BUDGET_APPROVAL_STATUSES,
      default: 'draft',
      index: true,
    },
    sourceType: {
      type: String,
      enum: BUDGET_SOURCE_TYPES,
      index: true,
    },
    budgetType: {
      type: String,
      enum: BUDGET_TYPES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: BUDGET_STATUSES,
      default: 'draft',
      index: true,
    },
    requestedAmount: { type: Number, default: 0, min: 0 },
    approvedAmount: { type: Number, default: 0, min: 0 },
    consumedAmount: { type: Number, default: 0, min: 0 },
    requestedMinutes: { type: Number, default: 0, min: 0 },
    approvedMinutes: { type: Number, default: 0, min: 0 },
    consumedMinutes: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: DEFAULT_CURRENCY, trim: true, uppercase: true },
    periodStart: { type: Date, default: null, index: true },
    periodEnd: { type: Date, default: null, index: true },
    clientApproval: { type: ClientApprovalSchema, default: () => ({}) },
    adminApproval: { type: AdminApprovalSchema, default: () => ({}) },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    notes: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    schemaVersion: { type: Number, default: 2 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_project_budgets',
    timestamps: true,
  }
);

ProjectBudgetSchema.index({ projectId: 1, createdAt: -1 });
ProjectBudgetSchema.index({ projectId: 1, approvalStatus: 1, createdAt: -1 });
ProjectBudgetSchema.index({ projectId: 1, entryType: 1, periodStart: 1 });

async function ensureProjectBudgetIndexes() {
  const ProjectBudget = getV2Model('PtsProjectBudget', ProjectBudgetSchema);
  await ProjectBudget.createIndexes();
  return ProjectBudget;
}

module.exports = {
  ProjectBudgetSchema,
  ensureProjectBudgetIndexes,
  getProjectBudgetModel: () => getV2Model('PtsProjectBudget', ProjectBudgetSchema),
};
