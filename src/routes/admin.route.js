
const express = require('express');
const router = express.Router();

const adminController = require('../app/Controllers/admin.controller');
const admin = require('../app/Middleware/admin');

const commonValidators = require('../app/Validators/commonValidators');
const adminValidator = require('../app/Validators/admin');

const errorMsgs = commonValidators.responseValidationResults;
router.post('/login', [adminValidator.login,errorMsgs], adminController.login);
router.post('/signup', [adminValidator.login,errorMsgs], adminController.signup);
router.get('/byId/:id', admin, adminController.getById);
router.put('/update/:id', admin, adminController.update);
router.post('/password/update', admin, adminController.updatePassword);
module.exports = router;
