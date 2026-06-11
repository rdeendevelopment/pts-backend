const { assertObjectId } = require('../../../kernel/validators/objectId');
const { getAiJobModel } = require('../../ai/models/aiJob.model');
const { getAiUsageModel } = require('../../ai/models/aiUsage.model');
const topicService = require('./topic.service');
const { assertActorTopicRead } = require('../helpers/discussFlowPermission.helper');

const DISCUSS_SOURCE_MODULES = ['discuss-flow', 'discussflow'];

async function getTopicAiUsage(actor, topicId) {
  const normalizedTopicId = assertObjectId(topicId, 'topicId');
  const normalizedTenantId = assertObjectId(actor.tenantId, 'tenantId');

  const { topic, member } = await topicService.getTopicContext(
    normalizedTenantId,
    actor.actorId,
    normalizedTopicId
  );
  assertActorTopicRead(actor, topic, member);

  const JobModel = getAiJobModel();
  const jobs = await JobModel.find({
    tenantId: normalizedTenantId,
    sourceModule: { $in: DISCUSS_SOURCE_MODULES },
    sourceId: String(topic._id),
    isDeleted: false,
  }).select('_id action').lean();

  const jobIds = jobs.map((row) => row._id);
  if (!jobIds.length) {
    return {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tokens: 0,
      estimated_cost: 0,
      jobs_count: 0,
      actions_breakdown: [],
    };
  }

  const UsageModel = getAiUsageModel();
  const [totals, breakdown] = await Promise.all([
    UsageModel.aggregate([
      { $match: { tenantId: normalizedTenantId, jobId: { $in: jobIds } } },
      {
        $group: {
          _id: null,
          totalInputTokens: { $sum: '$inputTokens' },
          totalOutputTokens: { $sum: '$outputTokens' },
          totalTokens: { $sum: '$totalTokens' },
          estimatedCost: { $sum: '$costEstimate' },
          jobsCount: { $sum: 1 },
        },
      },
    ]),
    UsageModel.aggregate([
      { $match: { tenantId: normalizedTenantId, jobId: { $in: jobIds } } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          totalTokens: { $sum: '$totalTokens' },
          estimatedCost: { $sum: '$costEstimate' },
        },
      },
      { $sort: { totalTokens: -1 } },
    ]),
  ]);

  const summary = totals[0] || {};
  return {
    total_input_tokens: summary.totalInputTokens || 0,
    total_output_tokens: summary.totalOutputTokens || 0,
    total_tokens: summary.totalTokens || 0,
    estimated_cost: summary.estimatedCost || 0,
    jobs_count: jobs.length,
    actions_breakdown: breakdown.map((row) => ({
      action: row._id,
      count: row.count,
      total_tokens: row.totalTokens,
      estimated_cost: row.estimatedCost,
    })),
  };
}

module.exports = {
  getTopicAiUsage,
};
