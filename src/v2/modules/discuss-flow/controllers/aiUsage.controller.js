const { sendSuccess } = require('../../../kernel/responses');
const aiUsageService = require('../services/aiUsage.service');

async function getTopicAiUsage(req, res) {
  const actor = req.dfActor || {
    actorType: 'user',
    actorId: String(req.v2Auth.accountId),
    tenantId: String(req.v2Auth.accountId),
  };
  const data = await aiUsageService.getTopicAiUsage(actor, req.params.id);
  return sendSuccess(res, data);
}

module.exports = {
  getTopicAiUsage,
};
