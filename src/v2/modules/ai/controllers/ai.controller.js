const { sendSuccess } = require('../../../kernel/responses');
const aiDispatcher = require('../services/ai-dispatcher.service');
const actionRegistry = require('../services/ai-action-registry.service');
const aiJobService = require('../services/ai-job.service');

async function runAi(req, res) {
  const body = req.body || {};
  const tenantId = body.tenant_id || body.tenantId || req.v2Auth.accountId;
  const sourceModule = body.source_module || body.sourceModule || null;
  const sourceId = body.source_id || body.sourceId || null;

  const result = await aiDispatcher.execute({
    action: body.action,
    actor: req.v2Auth.accountId,
    tenantId,
    sourceModule,
    sourceId,
    context: body.context || {},
    input: body.input || {},
  });

  return sendSuccess(res, result);
}

async function getJob(req, res) {
  const job = await aiJobService.getJobById(req.params.jobId, req.v2Auth.accountId);
  return sendSuccess(res, aiJobService.toJobDto(job));
}

async function listActions(_req, res) {
  return sendSuccess(res, { actions: actionRegistry.listActions() });
}

module.exports = {
  runAi,
  getJob,
  listActions,
};
