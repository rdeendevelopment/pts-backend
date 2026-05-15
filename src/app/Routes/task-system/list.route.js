const express    = require('express');
const router     = express.Router();
const userAuth   = require('../../Middleware/user_auth');
const controller = require('../../Controllers/task-system/list.controller');

router.use(userAuth);

// /node/ routes defined first to prevent /:id from swallowing the literal "node" segment
router.get('/node/:nodeId',         controller.getLists);
router.post('/node/:nodeId',        controller.createList);
router.put('/node/:nodeId/reorder', controller.reorderLists);

router.put('/:id/rename',           controller.renameList);
router.put('/:id/archive',          controller.archiveList);
router.delete('/:id',               controller.deleteList);

module.exports = router;
