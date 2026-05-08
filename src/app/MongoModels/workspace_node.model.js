// Collection: workspace_nodes
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjId = Schema.Types.ObjectId;

const WorkspaceNodeSchema = new Schema(
  {
    userId:        { type: ObjId, ref: 'CoreUser', required: true, index: true },
    legacyUserId:  { type: Number, default: null, index: true },
    name:          { type: String, required: true, trim: true },
    type:          { type: String, enum: ['project', 'folder', 'subfolder'], required: true },
    parentId:      { type: ObjId, default: null },
    rootProjectId: { type: ObjId, default: null },
    depth:         { type: Number, default: 0 },
    projectId:     { type: ObjId, ref: 'CoreProject', default: null, index: true },
    projectRef: {
      sourceId:   { type: Number, default: null, index: true },
      sourceType: { type: String, default: 'mongodb' },
    },
    isUserCreated: { type: Boolean, default: false },
    icon:          { type: String, default: null },
    color:         { type: String, default: null },
    order:         { type: Number, default: 0 },
    isActive:      { type: Boolean, default: true },
    isFavorited:   { type: Boolean, default: false },
    deletedAt:     { type: Date, default: null },
  },
  {
    collection: 'workspace_nodes',
    timestamps: true,
  }
);

WorkspaceNodeSchema.index({ userId: 1, parentId: 1 });
WorkspaceNodeSchema.index({ userId: 1, type: 1 });
WorkspaceNodeSchema.index({ userId: 1, projectId: 1 });
WorkspaceNodeSchema.index({ userId: 1, 'projectRef.sourceId': 1 });
WorkspaceNodeSchema.index({ userId: 1, deletedAt: 1, order: 1 });
WorkspaceNodeSchema.index({ userId: 1, deletedAt: 1, 'projectRef.sourceId': 1 });

module.exports = mongoose.models.WorkspaceNode || mongoose.model('WorkspaceNode', WorkspaceNodeSchema);
