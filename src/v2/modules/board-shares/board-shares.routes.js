const { Router } = require('express');
const { validateRequest } = require('../../kernel/validators');
const { assertObjectId } = require('../../kernel/validators/objectId');
const authenticate = require('../auth/middleware/authenticate');
const authorize = require('../rbac/middleware/authorize');
const boardShareController = require('./controllers/boardShare.controller');
const {
  listRules,
  myProjectsRules,
  createRules,
  updateRules,
  idParamRules,
} = require('./validators/boardShare.validators');

const router = Router();

/** Admin/team: manage client board shares (does not affect internal task board RBAC). */
const canManageBoardShares = authorize(['tasks.manage', 'projects.manage'], { mode: 'any' });

router.use(authenticate);

router.get('/my-projects', myProjectsRules, validateRequest, boardShareController.listMySharedProjects);
router.get('/', canManageBoardShares, listRules, validateRequest, boardShareController.listBoardShares);
router.get('/:id', canManageBoardShares, idParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, boardShareController.getBoardShareById);
router.post('/', canManageBoardShares, createRules, validateRequest, boardShareController.createBoardShare);
router.patch('/:id/revoke', canManageBoardShares, idParamRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, boardShareController.revokeBoardShare);
router.patch('/:id', canManageBoardShares, updateRules, validateRequest, (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'id');
    next();
  } catch (err) {
    next(err);
  }
}, boardShareController.updateBoardShare);

module.exports = router;
