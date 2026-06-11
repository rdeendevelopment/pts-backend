const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { DOCUMENT_STATUS, DOCUMENT_CONTENT_FORMAT } = require('../constants/discussFlow.constants');

const DiscussFlowDocumentVersionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowDocument', required: true, index: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true },
    content: { type: String, default: '' },
    contentFormat: { type: String, enum: DOCUMENT_CONTENT_FORMAT, default: 'markdown' },
    status: { type: String, enum: DOCUMENT_STATUS, required: true },
    changeReason: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_discuss_flow_document_versions', timestamps: { createdAt: true, updatedAt: false } }
);

DiscussFlowDocumentVersionSchema.index({ documentId: 1, version: 1 }, { unique: true });

async function ensureDiscussFlowDocumentVersionIndexes() {
  const Model = getV2Model('PtsDiscussFlowDocumentVersion', DiscussFlowDocumentVersionSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowDocumentVersionSchema,
  ensureDiscussFlowDocumentVersionIndexes,
  getDiscussFlowDocumentVersionModel: () => getV2Model('PtsDiscussFlowDocumentVersion', DiscussFlowDocumentVersionSchema),
};
