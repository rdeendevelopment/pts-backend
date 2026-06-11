const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { REQUIREMENT_STATUS, TOPIC_PRIORITY } = require('../constants/discussFlow.constants');

const DiscussFlowRequirementVersionSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    requirementId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowRequirement', required: true, index: true },
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true },
    description: { type: String, default: null },
    status: { type: String, enum: REQUIREMENT_STATUS, required: true },
    priority: { type: String, enum: TOPIC_PRIORITY, default: 'medium' },
    changeReason: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_discuss_flow_requirement_versions', timestamps: { createdAt: true, updatedAt: false } }
);

DiscussFlowRequirementVersionSchema.index({ requirementId: 1, version: 1 }, { unique: true });

async function ensureDiscussFlowRequirementVersionIndexes() {
  const Model = getV2Model('PtsDiscussFlowRequirementVersion', DiscussFlowRequirementVersionSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowRequirementVersionSchema,
  ensureDiscussFlowRequirementVersionIndexes,
  getDiscussFlowRequirementVersionModel: () => getV2Model('PtsDiscussFlowRequirementVersion', DiscussFlowRequirementVersionSchema),
};
