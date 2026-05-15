const express          = require('express');
const router           = express.Router();
const { authenticate } = require('../../../Middleware/auth');
const ctrl             = require('../controllers/private-workspace.controller');

router.use(authenticate);

// POST /private-workspace/seed  — seed default folders on first login
router.post('/seed', ctrl.seedWorkspace);

// ── Folders ───────────────────────────────────────────────────────────────────
router.get('/folders',                      ctrl.getFolders);
router.post('/folders',                     ctrl.createFolder);
router.put('/folders/reorder',              ctrl.reorderFolders);
router.put('/folders/:folderId/rename',     ctrl.renameFolder);
router.delete('/folders/:folderId',         ctrl.deleteFolder);

// ── Lists ─────────────────────────────────────────────────────────────────────
router.get('/folders/:folderId/lists',      ctrl.getLists);
router.post('/folders/:folderId/lists',     ctrl.createList);
router.put('/lists/:listId/rename',         ctrl.renameList);
router.delete('/lists/:listId',             ctrl.deleteList);

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get('/lists/:listId/tasks',          ctrl.getTasks);
router.post('/lists/:listId/tasks',         ctrl.createTask);
router.put('/lists/:listId/tasks/reorder',  ctrl.reorderTasks);
router.put('/tasks/:taskId',               ctrl.updateTask);
router.put('/tasks/:taskId/toggle-done',    ctrl.toggleDone);
router.delete('/tasks/:taskId',            ctrl.deleteTask);

module.exports = router;
