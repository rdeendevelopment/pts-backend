const mongoose = require('mongoose');
const { AppError, errorCodes } = require('../errors');

function isValidObjectId(value) {
  if (value == null || typeof value !== 'string') {
    return false;
  }

  return mongoose.isValidObjectId(value);
}

function assertObjectId(id, field) {
  const value = String(id ?? '').trim();
  if (!isValidObjectId(value)) {
    throw new AppError(`Invalid ${field}`, {
      status: 400,
      code: errorCodes.INVALID_ID,
      fields: { [field]: 'Invalid ID' },
    });
  }
  return value;
}

module.exports = {
  isValidObjectId,
  assertObjectId,
};
