const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { assertObjectId } = require('../../kernel/validators/objectId');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const controller = require('./controllers/user.controller');
const {
  listRules,
  idParamRules,
  createRules,
  profileUpdateRules,
  updateRules,
  statusRules,
  passwordRules,
  changePasswordRules,
  deleteQueryRules,
} = require('./validators/user.validators');

const router = Router();
const canViewUsers = authorize(['users.view', 'users.manage'], { mode: 'any' });
const canManageUsers = authorize('users.manage');

router.use(authenticate);

router.get('/me/profile', controller.getMyProfile);
router.patch('/me/profile', profileUpdateRules, validateRequest, controller.updateMyProfile);
router.patch('/me/password', changePasswordRules, validateRequest, controller.changeMyPassword);

router.get('/', canViewUsers, listRules, validateRequest, controller.listUsers);
router.get('/:id', canViewUsers, idParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.getUserById);
router.post('/', canManageUsers, createRules, validateRequest, controller.createUser);
router.patch('/:id/status', canManageUsers, statusRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.updateUserStatus);
router.patch('/:id/password', canManageUsers, passwordRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.resetUserPassword);
router.patch('/:id', canManageUsers, updateRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.updateUser);
router.delete('/:id', canManageUsers, deleteQueryRules, validateRequest, idParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.deleteUser);

module.exports = router;
