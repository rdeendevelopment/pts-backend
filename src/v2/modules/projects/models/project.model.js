const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  PROJECT_PRIORITIES,
  BILLING_TYPES,
  DEFAULT_CURRENCY,
} = require('../constants/project.constants');

const ProjectSettingsSchema = new Schema(
  {
    requireBudgetForTime: { type: Boolean, default: true },
    requireApprovalForExtraBudget: { type: Boolean, default: true },
    autoApproveInitialBudgetOnActivation: { type: Boolean, default: true },
    allowManualTimeEntry: { type: Boolean, default: true },
  },
  { _id: false }
);

const ProjectSchema = new Schema(
  {
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsClient',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true },
    code: { type: String, default: null, trim: true, uppercase: true },
    description: { type: String, default: null, trim: true },
    type: {
      type: String,
      enum: PROJECT_TYPES,
      default: 'fixed_hours',
      index: true,
    },
    status: {
      type: String,
      enum: PROJECT_STATUSES,
      default: 'draft',
      index: true,
    },
    priority: {
      type: String,
      enum: PROJECT_PRIORITIES,
      default: 'medium',
      index: true,
    },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    billingType: {
      type: String,
      enum: BILLING_TYPES,
      default: 'billable',
      index: true,
    },
    currency: { type: String, default: DEFAULT_CURRENCY, trim: true, uppercase: true },
    allowBudgetExceed: { type: Boolean, default: false },
    retainerHoursPerMonth: { type: Number, default: null, min: 0 },
    retainerRenewalDay: { type: Number, default: 1, min: 1, max: 28 },
    autoCreateMonthlyBudget: { type: Boolean, default: true },
    settings: { type: ProjectSettingsSchema, default: () => ({}) },
    tags: { type: [String], default: [], index: true },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'PtsAccount',
      default: null,
    },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_projects',
    timestamps: true,
  }
);

ProjectSchema.index(
  { clientId: 1, normalizedName: 1 },
  {
    unique: true,
    name: 'pts_projects_client_normalized_name_unique_active',
    partialFilterExpression: { isDeleted: false },
  }
);

ProjectSchema.index(
  { code: 1 },
  {
    unique: true,
    name: 'pts_projects_code_unique_active',
    partialFilterExpression: {
      isDeleted: false,
      code: { $type: 'string', $gt: '' },
    },
  }
);

ProjectSchema.index({ updatedAt: -1, _id: -1 });

async function ensureProjectIndexes() {
  const Project = getV2Model('PtsProject', ProjectSchema);
  await Project.createIndexes();
  return Project;
}

module.exports = {
  ProjectSchema,
  ensureProjectIndexes,
  getProjectModel: () => getV2Model('PtsProject', ProjectSchema),
};
