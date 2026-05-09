const attachmentService = require('../services/attachment.service');

const CONFIG = {
  maxTextLength: parseInt(process.env.CONVERSE_MAX_TEXT_LENGTH || '4000', 10),
  typingCooldownMs: parseInt(process.env.CONVERSE_TYPING_COOLDOWN_MS || '1400', 10),
  maxAttachmentsPerMessage: parseInt(process.env.CONVERSE_MAX_ATTACHMENTS || '10', 10),
  maxGroupNameLength: parseInt(process.env.CONVERSE_MAX_GROUP_NAME || '80', 10),
  maxGroupMembers: parseInt(process.env.CONVERSE_MAX_GROUP_MEMBERS || '200', 10),
  rateLimitWindowMs: parseInt(process.env.CONVERSE_RATE_LIMIT_WINDOW_MS || '10000', 10),
  rateLimitMaxMessages: parseInt(process.env.CONVERSE_RATE_LIMIT_MAX || '20', 10),
  maxFileSizeBytes: attachmentService.MAX_SIZE_BYTES,
  allowedExtensions: [...attachmentService.ALLOWED_EXTENSIONS],
  allowedMimeTypes: [...attachmentService.ALLOWED_MIMETYPES],
};

exports.getConfig = function getConfig(req, res) {
  return res.json({ success: true, data: CONFIG });
};
