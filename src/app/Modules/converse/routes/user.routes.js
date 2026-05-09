const express = require('express');
const router = express.Router();

const { authenticate } = require('../../../Middleware/auth');
const converseEnabled = require('../middlewares/converseEnabled.middleware');
const controller = require('../controllers/userSearch.controller');

router.use(authenticate, converseEnabled);

router.get('/search', controller.search);

module.exports = router;
