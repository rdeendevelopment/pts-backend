const { sendSuccess } = require('../../../kernel/responses');
const topicService = require('../services/topic.service');

async function createTopic(req, res) {
  const data = await topicService.createTopic(req.v2Auth.accountId, req.v2Auth.accountId, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function listTopics(req, res) {
  const data = await topicService.listTopics(req.v2Auth.accountId, req.v2Auth.accountId, req.query);
  return sendSuccess(res, data);
}

async function getTopic(req, res) {
  const data = await topicService.getTopic(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id);
  return sendSuccess(res, data);
}

async function updateTopic(req, res) {
  const data = await topicService.updateTopic(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  return sendSuccess(res, data);
}

module.exports = {
  createTopic,
  listTopics,
  getTopic,
  updateTopic,
};
