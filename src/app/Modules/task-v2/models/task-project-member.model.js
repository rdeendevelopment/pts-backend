// Collection: task_project_members
// Project-level membership for the task system (richer than the legacy project_members).
// Separating this lets the task system evolve its RBAC independently of core project access.
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const TaskProjectMemberSchema = new Schema(
  {
    projectId:  { type: ObjId, ref: 'CoreProject', required: true, index: true },
    projectRef: {
      sourceId:   { type: Number, default: null, index: true },
      sourceType: { type: String, default: 'mongodb' },
    },
    userId:     { type: ObjId, ref: 'CoreUser', required: true, index: true },
    // role within the task system (independent of core project role)
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'viewer'],
      default: 'member',
      index: true,
    },
    addedBy:    { type: ObjId, default: null },
    addedAt:    { type: Date, default: Date.now },
    isActive:   { type: Boolean, default: true, index: true },
  },
  {
    collection: 'taskProjectMembersV2',
    timestamps: true,
  }
);

TaskProjectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
TaskProjectMemberSchema.index({ userId: 1, isActive: 1 });
TaskProjectMemberSchema.index({ 'projectRef.sourceId': 1, userId: 1 });
TaskProjectMemberSchema.index({ 'projectRef.sourceId': 1, isActive: 1 });

module.exports = mongoose.models.TaskProjectMember || mongoose.model('TaskProjectMember', TaskProjectMemberSchema);
