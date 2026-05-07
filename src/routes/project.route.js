const express = require('express');
const router = express.Router();

const projectController = require('../app/Controllers/project.controller');
const { authenticate, requireSuperAdmin } = require('../app/Middleware/auth');

router.post('/save', projectController.save);
router.get('/all', projectController.getAllProjects);
router.get('/byId/:projectId', projectController.getProjectById);
router.put('/update/:projectId', projectController.updateProjectField);
router.delete('/delete/:projectId', authenticate, requireSuperAdmin, projectController.deleteProject);
router.get('/user/assigned/:userId', projectController.getUserAssignedProjects);
router.post('/user/detail', projectController.getUserProjectDetail);

module.exports = router;
