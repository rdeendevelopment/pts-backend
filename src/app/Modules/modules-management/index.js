const router = require('./routes/module.routes');
const { seedModules } = require('./services/module.service');
const moduleEnabled = require('./middlewares/moduleEnabled.middleware');

module.exports = { router, seedModules, moduleEnabled };
