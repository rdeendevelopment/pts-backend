const express = require('express');
const router = express.Router();

const userController = require('../app/Controllers/user.controller');
const { authenticate, requireSuperAdmin } = require('../app/Middleware/auth');

router.post('/save', userController.signup);
router.post('/login', userController.login);
router.get('/byId/:id', userController.getUserById);
router.get('/all', userController.getAllUsers);
router.put('/update/:id', userController.updateUser);
router.put('/updatePassword/:id', userController.updatePassword);
router.delete('/delete/:id', authenticate, requireSuperAdmin, userController.deleteUser);
router.put('/toggleActiveStatus/:id', userController.toggleActiveStatus);

module.exports = router;
