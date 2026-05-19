/**
 * Projects Module
 * Central hub for all project-related functionality
 *
 * Includes:
 * - Project CRUD operations
 * - User assignment management
 * - Budget tracking and management
 * - Time entry integration
 * - Project requests and change management
 */

// Controllers
const projectController = require('./controllers/project.controller');
const projectAssignmentController = require('./controllers/project-assignment.controller');
const projectBudgetController = require('./controllers/project-budget.controller');
const projectRequestController = require('./controllers/project-request.controller');
const projectDashboardController = require('./controllers/project-dashboard.controller');

// Services
const projectService = require('./services/project.service');
const projectBudgetService = require('./services/project-budget.service');
const projectDashboardService = require('./services/project-dashboard.service');

// Repositories
const projectRepository = require('./repositories/project.repository');
const budgetRepository = require('./repositories/budget.repository');

// Routes
const routes = require('./routes');

module.exports = {
  // Controllers
  controllers: {
    project: projectController,
    assignment: projectAssignmentController,
    budget: projectBudgetController,
    request: projectRequestController,
    dashboard: projectDashboardController,
  },

  // Services
  services: {
    project: projectService,
    budget: projectBudgetService,
    dashboard: projectDashboardService,
  },

  // Repositories
  repositories: {
    project: projectRepository,
    budget: budgetRepository,
  },

  // Routes
  routes,
};
