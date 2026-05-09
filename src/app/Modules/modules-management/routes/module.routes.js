const express = require('express');
const router = express.Router();

const { authenticate } = require('../../../Middleware/auth');
const superAdminOnly = require('../middlewares/superAdminOnly.middleware');
const controller = require('../controllers/module.controller');
const { toggleModule } = require('../validators/module.validator');

router.use(authenticate, superAdminOnly);

router.get('/', controller.listModules);
router.patch('/:key/toggle', toggleModule, controller.toggleModule);

module.exports = router;
