const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const controller = require('./controllers/todo.controller');
const { createRules, updateRules, listRules, reportRules, availableTaskRules, addTasksRules, completionRules, idRules } = require('./validators/todo.validators');

const router = Router();
router.use(authenticate);
const canView = authorize(['daily_flow.view', 'daily_flow.manage'], { mode: 'any' });
const canManage = authorize('daily_flow.manage');
router.get('/summary', canView, listRules, validateRequest, controller.summary);
router.get('/reports', canView, reportRules, validateRequest, controller.report);
router.get('/outstanding', canView, listRules, validateRequest, controller.outstanding);
router.post('/outstanding/move-to-today', canManage, controller.moveAllOutstanding);
router.get('/available-tasks', canView, availableTaskRules, validateRequest, controller.availableTasks);
router.post('/add-tasks', canManage, addTasksRules, validateRequest, controller.addTasks);
router.get('/', canView, listRules, validateRequest, controller.list);
router.post('/', canManage, createRules, validateRequest, controller.create);
router.get('/:id', canView, idRules, validateRequest, controller.get);
router.patch('/:id', canManage, updateRules, validateRequest, controller.update);
router.patch('/:id/complete', canManage, completionRules, validateRequest, controller.complete);
router.patch('/:id/reopen', canManage, idRules, validateRequest, controller.reopen);
router.post('/:id/move-to-today', canManage, idRules, validateRequest, controller.moveToToday);
router.delete('/:id', canManage, idRules, validateRequest, controller.remove);

module.exports = router;
