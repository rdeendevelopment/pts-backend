const { sendSuccess } = require('../../../kernel/responses');
const resumeService = require('../services/resume.service');

async function resumeTopic(req, res) {
  const actor = req.dfActor || {
    actorType: 'user',
    actorId: String(req.v2Auth.accountId),
    tenantId: String(req.v2Auth.accountId),
  };
  const data = await resumeService.resumeTopic(actor, req.params.id);
  return sendSuccess(res, data);
}

module.exports = {
  resumeTopic,
};
