const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { assertObjectId } = require('../../kernel/validators/objectId');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const controller = require('./controllers/module.controller');
const {
  listRules,
  idParamRules,
  createRules,
  updateRules,
} = require('./validators/module.validators');

const router = Router();
const canViewModules = authorize(['modules.view', 'modules.manage'], { mode: 'any' });
const canManageModules = authorize('modules.manage');

router.use(authenticate);

router.get('/', canViewModules, listRules, validateRequest, controller.listModules);
router.patch('/key/:key/status', canManageModules, controller.updateModuleByKey);
router.get('/:id', canViewModules, idParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.getModule);
router.post('/', canManageModules, createRules, validateRequest, controller.createModule);
router.patch('/:id', canManageModules, updateRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.updateModule);
router.delete('/:id', canManageModules, idParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.deleteModule);

module.exports = router;
