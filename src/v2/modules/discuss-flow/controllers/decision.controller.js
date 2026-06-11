const { sendSuccess } = require('../../../kernel/responses');
const decisionService = require('../services/decision.service');
const decisionLifecycleService = require('../services/decisionLifecycle.service');

async function createDecision(req, res) {
  const data = await decisionService.createDecision(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function listDecisions(req, res) {
  const data = await decisionService.listDecisions(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.query);
  return sendSuccess(res, data);
}

async function approveDecision(req, res) {
  const data = await decisionLifecycleService.approveDecision(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id);
  return sendSuccess(res, data);
}

async function lockDecision(req, res) {
  const data = await decisionLifecycleService.lockDecision(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  return sendSuccess(res, data);
}

async function createDecisionNewVersion(req, res) {
  const data = await decisionLifecycleService.createDecisionNewVersion(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function listDecisionVersions(req, res) {
  const data = await decisionLifecycleService.listDecisionVersions(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id);
  return sendSuccess(res, data);
}

module.exports = {
  createDecision,
  listDecisions,
  approveDecision,
  lockDecision,
  createDecisionNewVersion,
  listDecisionVersions,
};
