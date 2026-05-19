const express = require('express');
const projectRoutes = require('./project.route');
const projectAssignmentRoutes = require('./project-assignment.route');
const projectRequestRoutes = require('./project-request.route');
const projectBudgetRoutes = require('./project-budget.route');
const projectDashboardRoutes = require('./project-dashboard.route');

module.exports = function (router) {
  router.use('/project', projectRoutes);
  router.use('/projectUsers', projectAssignmentRoutes);
  router.use('/projectRequest', projectRequestRoutes);
  router.use('/projects', projectBudgetRoutes);
  router.use('/projects', projectDashboardRoutes);
};
