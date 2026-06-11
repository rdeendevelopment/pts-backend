const { warn } = require('../../../kernel/logger');

async function safeLoad(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    warn(`Daily Flow ${label} failed`, { message: err.message });
    return fallback;
  }
}

module.exports = {
  safeLoad,
};
