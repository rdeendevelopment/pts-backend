const budgetService = require('../Services/project-budget.service');

function userId(req) {
  return req.user?._id || req.auth?.user?._id || req.user?.id || req.auth?.user?.id;
}

function handleError(res, error) {
  return res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
  });
}

exports.getBudgets = async (req, res) => {
  try {
    const data = await budgetService.getBudgets(req.params.projectId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.createBudget = async (req, res) => {
  try {
    const data = await budgetService.createBudget(userId(req), req.params.projectId, req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.updateBudget = async (req, res) => {
  try {
    const data = await budgetService.updateBudget(userId(req), req.params.projectId, req.params.budgetId, req.body);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.deleteBudget = async (req, res) => {
  try {
    const data = await budgetService.deleteBudget(req.params.projectId, req.params.budgetId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getBudgetSummary = async (req, res) => {
  try {
    const data = await budgetService.getBudgetSummary(req.params.projectId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.createBudgetRequest = async (req, res) => {
  try {
    const data = await budgetService.createBudgetRequest(userId(req), req.params.projectId, req.body);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.getBudgetRequests = async (req, res) => {
  try {
    const data = await budgetService.getBudgetRequests(req.params.projectId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.approveBudgetRequest = async (req, res) => {
  try {
    const data = await budgetService.approveBudgetRequest(userId(req), req.params.projectId, req.params.requestId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.rejectBudgetRequest = async (req, res) => {
  try {
    const data = await budgetService.rejectBudgetRequest(userId(req), req.params.projectId, req.params.requestId);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.createNextRetainerBudget = async (req, res) => {
  try {
    const data = await budgetService.createNextRetainerBudget(userId(req), req.params.projectId);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

exports.createCurrentRetainerBudget = async (req, res) => {
  try {
    const data = await budgetService.createCurrentRetainerBudget(userId(req), req.params.projectId);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};
