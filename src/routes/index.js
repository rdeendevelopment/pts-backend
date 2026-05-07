const express = require('express');
const path = require("path");
const admin = require('./admin.route');
const user = require('./user.route');
const client = require('./client.route');
const project = require('./project.route');
const project_users = require('./project_users.route');
const attachments = require('./attachments.route');
const project_request = require('./project_requests');
const working_hours = require('./working_hours.route');
const auth = require('./auth.route');
const time = require('./time.route');
const projectDashboard = require('./project-dashboard.route');
const projectBudget = require('./project-budget.route');
const taskTime = require('./task-time.route');
const employeeWorkload = require('./employee-workload.route');

module.exports = function (app) {
	app.use("/api/images", express.static(path.join(__dirname, "src/storage/images")));
    app.use("/api/uploads", express.static(path.join(__dirname, "src/storage/uploads")));
	app.use('/api/auth', auth);
	app.use('/api/admin', admin);
	app.use('/api/user', user);
	app.use('/api/client' , client);
	app.use('/api/project', project);
	app.use('/api/projects', projectDashboard);
	app.use('/api/projects', projectBudget);
	app.use('/api/tasks', taskTime);
	app.use('/api/employees', employeeWorkload);
	app.use('/api/projectUsers', project_users);
	app.use('/api/attachments' , attachments);
	app.use('/api/projectRequest', project_request);
	app.use('/api/workingHours' , working_hours);
	app.use('/api/time' , time);

	// TASK SYSTEM v2 routes will be mounted here
}
