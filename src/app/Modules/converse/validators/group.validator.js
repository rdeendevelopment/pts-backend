const { body, param } = require('express-validator');
const mongoose = require('mongoose');
const { responseValidationResults } = require('../../../Validators/commonValidators');

function isObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new Error('Invalid ObjectId');
  return true;
}

const rename = [
  param('conversationId').custom(isObjectId),
  body('title')
    .notEmpty().withMessage('title is required')
    .isString().trim(),
  responseValidationResults,
];

const addMembers = [
  param('conversationId').custom(isObjectId),
  body('memberIds')
    .isArray({ min: 1 }).withMessage('memberIds must be a non-empty array'),
  body('memberIds.*')
    .custom(isObjectId).withMessage('Each memberId must be a valid ObjectId'),
  responseValidationResults,
];

const removeMember = [
  param('conversationId').custom(isObjectId),
  param('userId').custom(isObjectId).withMessage('userId must be a valid ObjectId'),
  responseValidationResults,
];

module.exports = { rename, addMembers, removeMember };
