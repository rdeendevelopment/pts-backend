const { sendSuccess } = require('../../../kernel/responses');
const timelineService = require('../services/timeline.service');
const topicService = require('../services/topic.service');
const { assertTopicRead } = require('../helpers/discussFlowPermission.helper');

async function listTimeline(req, res) {
  const accountId = req.v2Auth.accountId;
  const tenantId = req.v2Auth.accountId;
  const { topic, member } = await topicService.getTopicContext(tenantId, accountId, req.params.id);
  assertTopicRead(accountId, topic, member);

  const data = await timelineService.listTimeline(topic._id, req.query);
  return sendSuccess(res, data);
}

module.exports = {
  listTimeline,
};
