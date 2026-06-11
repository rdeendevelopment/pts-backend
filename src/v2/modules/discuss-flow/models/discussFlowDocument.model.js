const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const {
  DOCUMENT_TYPES,
  DOCUMENT_STATUS,
  DOCUMENT_CONTENT_FORMAT,
  DOCUMENT_SOURCE,
} = require('../constants/discussFlow.constants');

const DiscussFlowDocumentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowWorkspace', required: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    documentType: { type: String, enum: DOCUMENT_TYPES, required: true, index: true },
    status: { type: String, enum: DOCUMENT_STATUS, default: 'draft', index: true },
    content: { type: String, default: '' },
    contentFormat: { type: String, enum: DOCUMENT_CONTENT_FORMAT, default: 'markdown' },
    version: { type: Number, default: 1, min: 1 },
    parentDocumentId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowDocument', default: null },
    source: { type: String, enum: DOCUMENT_SOURCE, default: 'manual' },
    sourceAiJobId: { type: Schema.Types.ObjectId, ref: 'PtsAiJob', default: null },
    sourceReviewItemIds: { type: [Schema.Types.ObjectId], default: [] },
    linkedRequirementIds: { type: [Schema.Types.ObjectId], default: [] },
    linkedDecisionIds: { type: [Schema.Types.ObjectId], default: [] },
    linkedQuestionIds: { type: [Schema.Types.ObjectId], default: [] },
    linkedMessageIds: { type: [Schema.Types.ObjectId], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    reviewedAt: { type: Date, default: null },
    lockedBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    lockedAt: { type: Date, default: null },
    changeReason: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pts_discuss_flow_documents', timestamps: true }
);

DiscussFlowDocumentSchema.index(
  { topicId: 1, slug: 1 },
  { unique: true, name: 'pts_df_documents_topic_slug_unique', partialFilterExpression: { isDeleted: false } }
);
DiscussFlowDocumentSchema.index({ topicId: 1, status: 1, updatedAt: -1 });
DiscussFlowDocumentSchema.index({ tenantId: 1, sourceAiJobId: 1 }, { sparse: true });
DiscussFlowDocumentSchema.index({ title: 'text', content: 'text' }, { name: 'pts_df_documents_text' });

async function ensureDiscussFlowDocumentIndexes() {
  const Model = getV2Model('PtsDiscussFlowDocument', DiscussFlowDocumentSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowDocumentSchema,
  ensureDiscussFlowDocumentIndexes,
  getDiscussFlowDocumentModel: () => getV2Model('PtsDiscussFlowDocument', DiscussFlowDocumentSchema),
};
