const express = require('express');
const router = express.Router();
const userAuth = require('../../Middleware/user_auth');
const controller = require('../../Controllers/task-system/workspace.controller');

router.use(userAuth);

router.get('/tree', controller.getTree);
router.post('/folder', controller.createFolder);
router.put('/node/:id/rename', controller.renameNode);
router.delete('/node/:id', controller.deleteFolder);
router.put('/reorder', controller.reorderNodes);

module.exports = router;
