const express = require('express');
const router = express.Router();

const projectRequestController = require('../app/Controllers/project_requests');
const commonValidators = require('../app/Validators/commonValidators');

const errorMsgs = commonValidators.responseValidationResults;


router.post('/save', projectRequestController.save);
router.get('/all', projectRequestController.getAllRequests);
router.get('/project/all/:id', projectRequestController.getProjectAllRequests);
router.put('/updateRequest/:id', projectRequestController.updateRequest);
router.delete('/delete/:id', projectRequestController.deleteRequest);

module.exports = router;
