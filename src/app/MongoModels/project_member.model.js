// Collection: project_members — task-system project membership
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const ProjectMemberSchema = new Schema(
  {
    projectId: { type: ObjId, ref: 'CoreProject', required: true, index: true },
    userId:    { type: ObjId, ref: 'CoreUser', required: true },
    projectRef: {
      sourceId:   { type: Number, default: null, index: true },
      sourceType: { type: String, default: 'mongodb' },
    },
    role:      { type: String, enum: ['admin', 'member', 'viewer'], default: 'member' },
    addedBy:   { type: ObjId, ref: 'CoreUser', required: true },
    addedAt:   { type: Date, default: Date.now },
    isActive:  { type: Boolean, default: true },
  },
  {
    collection: 'project_members',
    timestamps: true,
  }
);

ProjectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
ProjectMemberSchema.index({ userId: 1, isActive: 1 });
ProjectMemberSchema.index({ projectId: 1, isActive: 1 });
ProjectMemberSchema.index({ 'projectRef.sourceId': 1, userId: 1 });

module.exports = mongoose.models.ProjectMember || mongoose.model('ProjectMember', ProjectMemberSchema);
