const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { QUESTION_STATUS } = require('../constants/discussFlow.constants');

const DiscussFlowQuestionSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    question: { type: String, required: true, trim: true },
    answer: { type: String, default: null },
    status: { type: String, enum: QUESTION_STATUS, default: 'open', index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    linkedMessages: { type: [Schema.Types.ObjectId], default: [] },
    schemaVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { collection: 'pts_discuss_flow_questions', timestamps: true }
);

DiscussFlowQuestionSchema.index({ topicId: 1, status: 1, createdAt: -1 });
DiscussFlowQuestionSchema.index({ question: 'text', answer: 'text' }, { name: 'pts_df_questions_text' });

async function ensureDiscussFlowQuestionIndexes() {
  const Model = getV2Model('PtsDiscussFlowQuestion', DiscussFlowQuestionSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowQuestionSchema,
  ensureDiscussFlowQuestionIndexes,
  getDiscussFlowQuestionModel: () => getV2Model('PtsDiscussFlowQuestion', DiscussFlowQuestionSchema),
};
