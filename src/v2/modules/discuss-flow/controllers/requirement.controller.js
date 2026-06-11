const { sendSuccess } = require('../../../kernel/responses');
const requirementService = require('../services/requirement.service');
const requirementLifecycleService = require('../services/requirementLifecycle.service');

async function createRequirement(req, res) {
  const data = await requirementService.createRequirement(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function listRequirements(req, res) {
  const data = await requirementService.listRequirements(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.query);
  return sendSuccess(res, data);
}

async function submitRequirementReview(req, res) {
  const data = await requirementLifecycleService.submitRequirementReview(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id);
  return sendSuccess(res, data);
}

async function approveRequirement(req, res) {
  const data = await requirementLifecycleService.approveRequirement(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id);
  return sendSuccess(res, data);
}

async function lockRequirement(req, res) {
  const data = await requirementLifecycleService.lockRequirement(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  return sendSuccess(res, data);
}

async function createRequirementNewVersion(req, res) {
  const data = await requirementLifecycleService.createRequirementNewVersion(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id, req.body);
  return sendSuccess(res, data, { status: 201 });
}

async function listRequirementVersions(req, res) {
  const data = await requirementLifecycleService.listRequirementVersions(req.v2Auth.accountId, req.v2Auth.accountId, req.params.id);
  return sendSuccess(res, data);
}

module.exports = {
  createRequirement,
  listRequirements,
  submitRequirementReview,
  approveRequirement,
  lockRequirement,
  createRequirementNewVersion,
  listRequirementVersions,
};
