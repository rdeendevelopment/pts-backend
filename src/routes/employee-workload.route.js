const express = require('express');
const router = express.Router();

const employeeWorkloadController = require('../app/Controllers/employee-workload.controller');
const { authenticate, requireAnyPermission } = require('../app/Middleware/auth');

router.use(authenticate);

router.get(
  '/:id/workload',
  requireAnyPermission(['reports.view_own', 'time.view_own', 'reports.view_team', 'time.view_team', 'reports.view_all', 'time.view_all']),
  employeeWorkloadController.getEmployeeWorkload
);

module.exports = router;
