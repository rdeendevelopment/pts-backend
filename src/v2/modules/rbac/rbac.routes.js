const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { assertObjectId } = require('../../kernel/validators/objectId');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('./middleware/authorize');
const controller = require('./controllers/rbac.controller');
const {
  roleIdParamRules,
  accountIdParamRules,
  accountRoleParamRules,
  createRoleRules,
  updateRoleRules,
  assignAccountRoleRules,
} = require('./validators/rbac.validators');

const router = Router();
const canViewRbac = authorize(['rbac.view', 'rbac.manage'], { mode: 'any' });
const canManageRbac = authorize('rbac.manage');

router.use(authenticate);

router.get('/roles', canViewRbac, controller.listRoles);
router.get('/roles/:id', canViewRbac, roleIdParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.getRole);
router.post('/roles', canManageRbac, createRoleRules, validateRequest, controller.createRole);
router.patch('/roles/:id', canManageRbac, updateRoleRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.updateRole);
router.delete('/roles/:id', canManageRbac, roleIdParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.deleteRole);

router.get('/permissions', canViewRbac, controller.listPermissions);

router.get('/accounts/:accountId/roles', canViewRbac, accountIdParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.accountId, 'accountId');
    next();
  } catch (err) {
    next(err);
  }
}, controller.listAccountRoles);
router.post('/accounts/:accountId/roles', canManageRbac, assignAccountRoleRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.accountId, 'accountId');
    next();
  } catch (err) {
    next(err);
  }
}, controller.assignAccountRole);
router.delete('/accounts/:accountId/roles/:roleId', canManageRbac, accountRoleParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.accountId, 'accountId');
    assertObjectId(req.params.roleId, 'roleId');
    next();
  } catch (err) {
    next(err);
  }
}, controller.removeAccountRole);

module.exports = router;
