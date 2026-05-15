// Task V2 module entry point.
// Routes are registered directly in server.js.
// This file exists as a reference for the module's exports.

const boardRoutes   = require('./routes/board.routes');
const privateRoutes = require('./routes/private-workspace.routes');

module.exports = { boardRoutes, privateRoutes };
