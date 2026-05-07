const express = require('express');
const router = express.Router();

const budgetController = require('../app/Controllers/project-budget.controller');
const { authenticate, requireAnyPermission, requirePermission } = require('../app/Middleware/auth');

router.use(authenticate);

router.get('/:projectId/budgets', requireAnyPermission(['projects.view_budget', 'projects.view']), budgetController.getBudgets);
router.post('/:projectId/budgets', requirePermission('projects.manage_budget'), budgetController.createBudget);
router.post('/:projectId/budgets/retainer-current-month', requirePermission('projects.manage_budget'), budgetController.createCurrentRetainerBudget);
router.post('/:projectId/budgets/retainer-next-month', requirePermission('projects.manage_budget'), budgetController.createNextRetainerBudget);
router.put('/:projectId/budgets/:budgetId', requirePermission('projects.manage_budget'), budgetController.updateBudget);
router.delete('/:projectId/budgets/:budgetId', requirePermission('projects.manage_budget'), budgetController.deleteBudget);
router.get('/:projectId/budget-summary', requireAnyPermission(['projects.view_budget', 'projects.view']), budgetController.getBudgetSummary);

router.post('/:projectId/budget-requests', requirePermission('projects.request_budget_hours'), budgetController.createBudgetRequest);
router.get('/:projectId/budget-requests', requireAnyPermission(['projects.view_budget', 'projects.view']), budgetController.getBudgetRequests);
router.post('/:projectId/budget-requests/:requestId/approve', requirePermission('projects.approve_budget_request'), budgetController.approveBudgetRequest);
router.post('/:projectId/budget-requests/:requestId/reject', requirePermission('projects.approve_budget_request'), budgetController.rejectBudgetRequest);

module.exports = router;
