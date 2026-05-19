const express = require('express');
const router = express.Router();

const projectUsersController = require('../controllers/project-assignment.controller');
const commonValidators = require('../../Validators/commonValidators');

const errorMsgs = commonValidators.responseValidationResults;


router.post('/assign', projectUsersController.assignOrReassignUser);
router.post('/unassign', projectUsersController.unassignUser);
router.get('/all/assigned/:userId', projectUsersController.getUserAssignedProjectsWithDetails);


module.exports = router;