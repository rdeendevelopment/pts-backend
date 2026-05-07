const express = require('express');
const router = express.Router();

const clientController = require('../app/Controllers/client.controller');
const commonValidators = require('../app/Validators/commonValidators');
const { authenticate, requireSuperAdmin } = require('../app/Middleware/auth');

const errorMsgs = commonValidators.responseValidationResults;


router.post('/save', clientController.save);
router.get('/all', clientController.getAllClients);
router.put('/update/:id', clientController.updateClient);
router.get('/byId/:id', clientController.getClientById);
router.delete('/delete/:id', authenticate, requireSuperAdmin, clientController.deleteClient);
router.put('/toggleActiveStatus/:id', clientController.toggleActiveStatus);

module.exports = router;
