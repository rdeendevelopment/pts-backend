const express = require('express');
const router = express.Router();
const { authenticate } = require('../../../Middleware/auth');
const converseEnabled = require('../middlewares/converseEnabled.middleware');
const { getConfig } = require('../controllers/config.controller');

router.get('/', authenticate, converseEnabled, getConfig);

module.exports = router;
