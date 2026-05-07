const express = require('express');
const router = express.Router();

const projectUsersController = require('../app/Controllers/project_users');
const commonValidators = require('../app/Validators/commonValidators');

const errorMsgs = commonValidators.responseValidationResults;


router.post('/assign', projectUsersController.assignOrReassignUser);
router.post('/unassign', projectUsersController.unassignUser);
router.get('/all/assigned/:userId', projectUsersController.getUserAssignedProjectsWithDetails);


module.exports = router;