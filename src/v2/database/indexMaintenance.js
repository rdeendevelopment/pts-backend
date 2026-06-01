const { warn } = require('../kernel/logger');

function isIndexConflictError(err) {
  if (!err) return false;
  if (err.code === 85 || err.code === 86) return true;
  const message = String(err.message || '');
  return /already exists/i.test(message) || /IndexOptionsConflict/i.test(message);
}

async function safeCreateIndexes(model, { label = model?.modelName } = {}) {
  try {
    await model.createIndexes();
  } catch (err) {
    if (isIndexConflictError(err)) {
      warn('Index ensure skipped due to existing index', {
        model: label,
        message: err.message,
      });
      return;
    }
    throw err;
  }
}

module.exports = {
  isIndexConflictError,
  safeCreateIndexes,
};
