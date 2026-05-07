const express = require('express');
const router = express.Router();
const userAuth = require('../../Middleware/user_auth');
const controller = require('../../Controllers/task-system/task.controller');

router.use(userAuth);

// /node/ routes registered first to prevent /:id swallowing the literal "node" segment
router.get('/node/:nodeId', controller.getTasksForNode);
router.get('/node/:nodeId/board', controller.getUserBoard);
router.get('/node/:nodeId/assignees', controller.getAssignableUsers);
router.post('/node/:nodeId', controller.createTask);

router.get('/:id', controller.getTask);
router.put('/:id', controller.updateTask);
router.post('/:id/assign', controller.assignMember);
router.post('/:id/unassign', controller.unassignMember);
router.put('/:id/move', controller.moveTask);
router.put('/:id/reorder', controller.reorderTask);
router.put('/:id/complete', controller.completeTask);
router.delete('/:id', controller.archiveTask);
router.put('/:id/restore', controller.restoreTask);

module.exports = router;
