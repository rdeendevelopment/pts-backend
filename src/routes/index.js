const express = require('express');
const path = require("path");
const admin = require('./admin.route');
const user = require('./user.route');
const client = require('./client.route');
const attachments = require('./attachments.route');
const working_hours = require('./working_hours.route');
const auth = require('./auth.route');
const time = require('./time.route');
const taskTime = require('./task-time.route');
const employeeWorkload = require('./employee-workload.route');

// Import projects module
const projectModuleRoutes = require('../app/modules/projects/routes');

module.exports = function (app) {
	app.use("/api/images", express.static(path.join(__dirname, "src/storage/images")));
    app.use("/api/uploads", express.static(path.join(__dirname, "src/storage/uploads")));
	app.use('/api/auth', auth);
	app.use('/api/admin', admin);
	app.use('/api/user', user);
	app.use('/api/client' , client);
	app.use('/api/tasks', taskTime);
	app.use('/api/employees', employeeWorkload);
	app.use('/api/attachments' , attachments);
	app.use('/api/workingHours' , working_hours);
	app.use('/api/time' , time);

	// Mount projects module routes
	const projectRouter = express.Router();
	projectModuleRoutes(projectRouter);
	app.use('/api', projectRouter);

	// TASK SYSTEM v2 routes will be mounted here
}
