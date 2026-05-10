const express = require('express');
const router = express.Router();
const { authenticate } = require('../../../Middleware/auth');
const controller = require('../controllers/announcement.controller');

router.use(authenticate);

router.get('/active', controller.listActive);
router.post('/:id/read', controller.markRead);
router.post('/:id/dismiss', controller.dismiss);

router.get('/', controller.listAdmin);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/enabled', controller.setEnabled);
router.delete('/:id', controller.archive);

module.exports = router;
