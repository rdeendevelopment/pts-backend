const { AppError } = require('../../../kernel/errors');
const aiErrorCodes = require('../errors/aiErrorCodes');
const { safeParseJson } = require('../helpers/safeJson.helper');

function hasRequiredFields(obj, required = []) {
  if (!obj || typeof obj !== 'object') return false;
  return required.every((key) => obj[key] != null && obj[key] !== '');
}

function validateResponse(rawContent, responseSchema) {
  const parsed = safeParseJson(rawContent, null);

  if (!parsed) {
    throw new AppError('AI response is not valid JSON', {
      status: 422,
      code: aiErrorCodes.AI_VALIDATION_FAILED,
      details: { preview: String(rawContent || '').slice(0, 500) },
    });
  }

  if (responseSchema?.type === 'object' && Array.isArray(responseSchema.required)) {
    if (!hasRequiredFields(parsed, responseSchema.required)) {
      throw new AppError('AI response missing required fields', {
        status: 422,
        code: aiErrorCodes.AI_VALIDATION_FAILED,
        details: {
          required: responseSchema.required,
          receivedKeys: Object.keys(parsed),
        },
      });
    }
  }

  return parsed;
}

module.exports = {
  validateResponse,
  hasRequiredFields,
};
