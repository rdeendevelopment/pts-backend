const { body, param } = require('express-validator');
const mongoose = require('mongoose');
const { responseValidationResults } = require('../../../Validators/commonValidators');

function isObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new Error('Invalid ObjectId');
  return true;
}

const conversationIdParam = param('conversationId').custom(isObjectId);

const createDirect = [
  body('recipientUserId')
    .notEmpty().withMessage('recipientUserId is required')
    .custom(isObjectId).withMessage('recipientUserId must be a valid ObjectId'),
  responseValidationResults,
];

const createGroup = [
  body('title')
    .notEmpty().withMessage('title is required')
    .isString().trim(),
  body('memberIds')
    .isArray({ min: 1 }).withMessage('memberIds must be a non-empty array'),
  body('memberIds.*')
    .custom(isObjectId).withMessage('Each memberId must be a valid ObjectId'),
  responseValidationResults,
];

const muteBody = [
  conversationIdParam,
  body('isMuted')
    .notEmpty().withMessage('isMuted is required')
    .isBoolean().withMessage('isMuted must be a boolean'),
  responseValidationResults,
];

const conversationIdOnly = [
  conversationIdParam,
  responseValidationResults,
];

module.exports = { createDirect, createGroup, muteBody, conversationIdOnly };
