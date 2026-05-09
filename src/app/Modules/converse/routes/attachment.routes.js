const express = require('express');

const { authenticate } = require('../../../Middleware/auth');
const converseEnabled = require('../middlewares/converseEnabled.middleware');
const controller = require('../controllers/attachment.controller');

// express-fileupload is registered globally in server.js and already parses
// multipart bodies before this route runs. Using multer here would conflict
// (it would receive an empty stream) — so we rely on req.files instead.

const router = express.Router();

router.use(authenticate, converseEnabled);

router.post('/upload', controller.upload);

module.exports = router;
