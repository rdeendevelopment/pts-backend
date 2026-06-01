const { Router } = require('express');
const controller = require('./controllers/example.controller');

const router = Router();

router.get('/', controller.getStatus);

module.exports = router;
