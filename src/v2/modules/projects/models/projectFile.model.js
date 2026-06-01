const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');

const ProjectFileSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'PtsProject',
      required: true,
      index: true,
    },
    fileName: { type: String, required: true, trim: true },
    fileUrl: { type: String, required: true, trim: true },
    fileType: { type: String, default: null, trim: true, index: true },
    fileSize: { type: Number, default: null, min: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'pts_project_files',
    timestamps: true,
  }
);

ProjectFileSchema.index({ projectId: 1, createdAt: -1 });

async function ensureProjectFileIndexes() {
  const ProjectFile = getV2Model('PtsProjectFile', ProjectFileSchema);
  await ProjectFile.createIndexes();
  return ProjectFile;
}

module.exports = {
  ProjectFileSchema,
  ensureProjectFileIndexes,
  getProjectFileModel: () => getV2Model('PtsProjectFile', ProjectFileSchema),
};
