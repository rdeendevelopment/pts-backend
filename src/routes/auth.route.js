const express = require('express');
const router = express.Router();

const authController = require('../app/Controllers/auth.controller');

router.get('/me', authController.me);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

module.exports = router;
