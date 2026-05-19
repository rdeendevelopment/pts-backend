const express = require('express');
const router = express.Router();

const projectRequestController = require('../controllers/project-request.controller');
const commonValidators = require('../../Validators/commonValidators');

const errorMsgs = commonValidators.responseValidationResults;


router.post('/save', projectRequestController.save);
router.get('/all', projectRequestController.getAllRequests);
router.get('/project/all/:id', projectRequestController.getProjectAllRequests);
router.put('/updateRequest/:id', projectRequestController.updateRequest);
router.delete('/delete/:id', projectRequestController.deleteRequest);

module.exports = router;
