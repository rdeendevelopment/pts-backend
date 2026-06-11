const { sendSuccess } = require('../../../kernel/responses');
const searchService = require('../services/search.service');

async function searchDiscussFlow(req, res) {
  const actor = {
    actorType: 'user',
    actorId: String(req.v2Auth.accountId),
    tenantId: String(req.v2Auth.accountId),
  };
  const data = await searchService.searchDiscussFlow(actor, req.query);
  return sendSuccess(res, data);
}

module.exports = {
  searchDiscussFlow,
};
