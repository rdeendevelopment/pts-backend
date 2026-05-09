const { body, param } = require('express-validator');
const { responseValidationResults } = require('../../../Validators/commonValidators');

const toggleModule = [
  param('key')
    .notEmpty()
    .isString()
    .trim(),
  body('enabled')
    .notEmpty()
    .isBoolean()
    .withMessage('enabled must be a boolean'),
  responseValidationResults,
];

module.exports = { toggleModule };
