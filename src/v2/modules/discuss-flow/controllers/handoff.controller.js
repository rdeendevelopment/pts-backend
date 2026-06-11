const { sendSuccess } = require('../../../kernel/responses');
const handoffService = require('../services/handoff.service');

async function createTaskFromRequirement(req, res) {
  const data = await handoffService.createTaskFromRequirement(
    req.v2Auth.accountId,
    req.v2Auth.accountId,
    req.params.id,
    req.body,
    req
  );
  const status = data.status === 'created' ? 201 : 202;
  return sendSuccess(res, data, { status });
}

async function createTaskFromReviewItem(req, res) {
  const data = await handoffService.createTaskFromReviewItem(
    req.v2Auth.accountId,
    req.v2Auth.accountId,
    req.params.id,
    req.body,
    req
  );
  const status = data.status === 'created' ? 201 : 202;
  return sendSuccess(res, data, { status });
}

async function createProjectBriefFromDocument(req, res) {
  const data = await handoffService.createProjectBriefFromDocument(
    req.v2Auth.accountId,
    req.v2Auth.accountId,
    req.params.documentId,
    req.body
  );
  return sendSuccess(res, data, { status: 202 });
}

module.exports = {
  createTaskFromRequirement,
  createTaskFromReviewItem,
  createProjectBriefFromDocument,
};
