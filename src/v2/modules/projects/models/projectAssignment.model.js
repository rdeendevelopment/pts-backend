const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  ASSIGNMENT_ROLES,
  ASSIGNMENT_STATUSES,
  CAP_PERIODS,
} = require('../constants/project.constants');

const AllocationSchema = new Schema(
  {
    allocatedMinutes: { type: Number, default: 0, min: 0 },
    capPeriod: {
      type: String,
      enum: CAP_PERIODS,
      default: 'project',
    },
    allowExceed: { type: Boolean, default: false },
    canLogTime: { type: Boolean, default: true },
  },
  { _id: false }
);

const AssignmentStatsSchema = new Schema(
  {
    consumedMinutes: { type: Number, default: 0, min: 0 },
    remainingMinutes: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const ProjectAssignmentSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsUser',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ASSIGNMENT_ROLES,
      default: 'member',
    },
    status: {
      type: String,
      enum: ASSIGNMENT_STATUSES,
      default: 'active',
      index: true,
    },
    allocation: { type: AllocationSchema, default: () => ({}) },
    stats: { type: AssignmentStatsSchema, default: () => ({}) },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    assignedAt: { type: Date, default: null },
    removedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    removedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_project_assignments',
    timestamps: true,
  }
);

ProjectAssignmentSchema.index(
  { projectId: 1, userId: 1 },
  {
    unique: true,
    name: 'pts_project_assignments_project_user_unique_active',
    partialFilterExpression: { isDeleted: false },
  }
);

async function ensureProjectAssignmentIndexes() {
  const ProjectAssignment = getV2Model('PtsProjectAssignment', ProjectAssignmentSchema);
  await ProjectAssignment.createIndexes();
  return ProjectAssignment;
}

module.exports = {
  ProjectAssignmentSchema,
  ensureProjectAssignmentIndexes,
  getProjectAssignmentModel: () => getV2Model('PtsProjectAssignment', ProjectAssignmentSchema),
};
