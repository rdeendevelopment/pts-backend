const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { assertObjectId } = require('../../kernel/validators/objectId');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const controller = require('./controllers/client.controller');
const {
  listRules,
  idParamRules,
  createRules,
  updateRules,
  statusRules,
} = require('./validators/client.validators');

const router = Router();
const canViewClients = authorize(['clients.view', 'clients.manage'], { mode: 'any' });
const canManageClients = authorize('clients.manage');

router.use(authenticate);

router.get('/', canViewClients, listRules, validateRequest, controller.listClients);
router.get('/:id', canViewClients, idParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.getClientById);
router.post('/', canManageClients, createRules, validateRequest, controller.createClient);
router.patch('/:id/status', canManageClients, statusRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.updateClientStatus);
router.patch('/:id', canManageClients, updateRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.updateClient);
router.delete('/:id', canManageClients, idParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, controller.deleteClient);

module.exports = router;
