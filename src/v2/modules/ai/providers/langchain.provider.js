/**
 * LangChain adapter — optional, not mandatory.
 * Reserved for future multi-step chains. Simple calls use OpenAI SDK directly.
 */
const { info } = require('../../../kernel/logger');

function isLangChainAvailable() {
  try {
    require.resolve('langchain');
    return true;
  } catch (_) {
    return false;
  }
}

async function runChain(_chainConfig) {
  info('LangChain provider invoked but chains are not enabled in Layer 1');
  throw new Error('LangChain chains are not enabled. Use ai-runner OpenAI path.');
}

module.exports = {
  isLangChainAvailable,
  runChain,
};
