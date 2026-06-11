const { Schema } = require('mongoose');
const { getV2Model } = require('../../../database/connection');
const { TIMELINE_EVENT_TYPES } = require('../constants/discussFlow.constants');

const DiscussFlowTimelineSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: 'PtsDiscussFlowTopic', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', required: true, index: true },
    eventType: { type: String, enum: TIMELINE_EVENT_TYPES, required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'PtsAccount', default: null },
    payload: { type: Schema.Types.Mixed, default: {} },
    schemaVersion: { type: Number, default: 1 },
  },
  { collection: 'pts_discuss_flow_timeline_events', timestamps: true }
);

DiscussFlowTimelineSchema.index({ topicId: 1, createdAt: -1 });

async function ensureDiscussFlowTimelineIndexes() {
  const Model = getV2Model('PtsDiscussFlowTimeline', DiscussFlowTimelineSchema);
  await Model.createIndexes();
  return Model;
}

module.exports = {
  DiscussFlowTimelineSchema,
  ensureDiscussFlowTimelineIndexes,
  getDiscussFlowTimelineModel: () => getV2Model('PtsDiscussFlowTimeline', DiscussFlowTimelineSchema),
};
