const { validationResult } = require('express-validator');
const { AppError, errorCodes } = require('../errors');

function validateRequest(req, _res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const fields = {};
  result.array().forEach((item) => {
    fields[item.param] = item.msg;
  });

  return next(new AppError('Validation failed', {
    status: 400,
    code: errorCodes.VALIDATION_ERROR,
    fields,
  }));
}

module.exports = {
  validateRequest,
};
