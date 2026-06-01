const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const { assertObjectId } = require('../../../kernel/validators/objectId');
const projectBudgetService = require('../services/projectBudget.service');

async function listBudgets(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await projectBudgetService.listBudgets(projectId);
  return sendSuccess(res, { items: data });
}

async function createBudget(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const data = await projectBudgetService.createBudget(
    projectId,
    req.body,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data, { status: 201 });
}

async function updateBudget(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const budgetId = assertObjectId(req.params.budgetId, 'budgetId');
  const data = await projectBudgetService.updateBudget(
    projectId,
    budgetId,
    req.body,
    req.v2Auth.accountId
  );
  return sendSuccess(res, data);
}

async function updateBudgetStatus(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const budgetId = assertObjectId(req.params.budgetId, 'budgetId');
  const data = await projectBudgetService.updateBudgetStatus(
    projectId,
    budgetId,
    req.body,
    req.v2Auth.accountId,
    req
  );
  return sendSuccess(res, data);
}

async function deleteBudget(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const budgetId = assertObjectId(req.params.budgetId, 'budgetId');
  const data = await projectBudgetService.deleteBudget(
    projectId,
    budgetId,
    req.v2Auth.accountId
  );
  return sendSuccess(res, data);
}

async function ensureCurrentRetainerBudget(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const retainerRenewalService = require('../services/retainerRenewal.service');
  const result = await retainerRenewalService.ensureCurrentRetainerBudget(
    projectId,
    req.v2Auth.accountId,
    req,
  );
  const data = await projectBudgetService.listBudgets(projectId);
  return sendSuccess(res, {
    budget: result.budget ? data.find((row) => String(row.id) === String(result.budget._id)) : null,
    items: data,
    created: result.created,
  }, { status: result.created ? 201 : 200 });
}

async function ensureNextRetainerBudget(req, res) {
  const projectId = assertObjectId(req.params.projectId, 'projectId');
  const retainerRenewalService = require('../services/retainerRenewal.service');
  const result = await retainerRenewalService.ensureNextRetainerBudget(
    projectId,
    req.v2Auth.accountId,
    req,
  );
  const data = await projectBudgetService.listBudgets(projectId);
  return sendSuccess(res, {
    budget: result.budget ? data.find((row) => String(row.id) === String(result.budget._id)) : null,
    items: data,
    created: result.created,
  }, { status: result.created ? 201 : 200 });
}

module.exports = {
  listBudgets: asyncHandler(listBudgets),
  createBudget: asyncHandler(createBudget),
  updateBudget: asyncHandler(updateBudget),
  updateBudgetStatus: asyncHandler(updateBudgetStatus),
  deleteBudget: asyncHandler(deleteBudget),
  ensureCurrentRetainerBudget: asyncHandler(ensureCurrentRetainerBudget),
  ensureNextRetainerBudget: asyncHandler(ensureNextRetainerBudget),
};
