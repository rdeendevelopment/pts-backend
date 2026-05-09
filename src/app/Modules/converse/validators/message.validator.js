const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { responseValidationResults } = require('../../../Validators/commonValidators');

function isObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw new Error('Invalid ObjectId');
  return true;
}

function optionalObjectId(value) {
  if (value === undefined || value === null || value === '') return true;
  return isObjectId(value);
}

const listMessages = [
  param('conversationId').custom(isObjectId),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  responseValidationResults,
];

const sendMessage = [
  body('conversationId')
    .notEmpty().withMessage('conversationId is required')
    .custom(isObjectId).withMessage('conversationId must be a valid ObjectId'),
  body('text').optional().isString(),
  body('replyToMessageId')
    .optional({ nullable: true })
    .custom(optionalObjectId).withMessage('replyToMessageId must be a valid ObjectId'),
  responseValidationResults,
];

const editMessage = [
  param('messageId').custom(isObjectId),
  body('text')
    .notEmpty().withMessage('text is required')
    .isString().trim(),
  responseValidationResults,
];

const messageIdParam = [
  param('messageId').custom(isObjectId).withMessage('messageId must be a valid ObjectId'),
  responseValidationResults,
];

const forward = [
  param('messageId').custom(isObjectId),
  body('targetConversationIds')
    .isArray({ min: 1 }).withMessage('targetConversationIds must be a non-empty array'),
  body('targetConversationIds.*')
    .custom(isObjectId).withMessage('Each targetConversationId must be a valid ObjectId'),
  responseValidationResults,
];

module.exports = { listMessages, sendMessage, editMessage, messageIdParam, forward };
