const { getAiJobModel } = require('../../ai/models/aiJob.model');
const { toAiJobSummaryDto } = require('../dto/discussFlow.dto');

const DISCUSS_SOURCE_MODULES = ['discuss-flow', 'discussflow'];

async function listTopicJobs(tenantId, topicId, { activeOnly = false } = {}) {
  const Model = getAiJobModel();
  const query = {
    tenantId,
    sourceModule: { $in: DISCUSS_SOURCE_MODULES },
    sourceId: String(topicId),
    isDeleted: false,
  };

  if (activeOnly) {
    query.status = { $in: ['queued', 'running'] };
  }

  const items = await Model.find(query).sort({ createdAt: -1 }).limit(20).lean();
  return items.map(toAiJobSummaryDto);
}

module.exports = {
  listTopicJobs,
  DISCUSS_SOURCE_MODULES,
};
