const moduleEnabled = require('../../modules-management/middlewares/moduleEnabled.middleware');
const { MODULE_KEYS } = require('../constants/converse.constants');

module.exports = moduleEnabled(MODULE_KEYS.CONVERSE);
