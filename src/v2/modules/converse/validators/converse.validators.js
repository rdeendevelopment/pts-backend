const { body, param, query } = require('express-validator');

const conversationIdRules = [
  param('conversationId').isString().notEmpty().withMessage('conversationId is required'),
];

const messageIdRules = [
  ...conversationIdRules,
  param('messageId').isString().notEmpty().withMessage('messageId is required'),
];

const createDirectRules = [
  body('recipientUserId').optional().isString(),
  body('recipientId').optional().isString(),
  body().custom((value) => {
    if (!value.recipientUserId && !value.recipientId) {
      throw new Error('recipientUserId is required');
    }
    return true;
  }),
];

const createGroupRules = [
  body('title').isString().trim().notEmpty().withMessage('title is required'),
  body('memberIds').isArray({ min: 1 }).withMessage('memberIds must be a non-empty array'),
  body('avatar').optional().isString().isLength({ max: 2048 }),
];

const sendMessageRules = [
  ...conversationIdRules,
  body('text').optional().isString(),
  body('attachments').optional().isArray(),
  body('replyToMessageId').optional().isString(),
  body('clientTempId').optional().isString(),
  body('mentions').optional().isArray({ max: 20 }),
  body('mentionAll').optional().isBoolean(),
];

const participantsRules = [
  ...conversationIdRules,
  body('memberIds').isArray({ min: 1 }).withMessage('memberIds is required'),
];

const searchRules = [
  query('q').optional().isString(),
  query('query').optional().isString(),
];

module.exports = {
  conversationIdRules,
  messageIdRules,
  createDirectRules,
  createGroupRules,
  sendMessageRules,
  participantsRules,
  searchRules,
};
