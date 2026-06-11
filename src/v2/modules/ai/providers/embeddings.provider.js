const aiEnv = require('../config/ai.env');
const { AppError } = require('../../../kernel/errors');
const aiErrorCodes = require('../errors/aiErrorCodes');
const { getOpenAiClient, isOpenAiConfigured } = require('./openai.provider');
const { AI_MODELS } = require('../constants/ai-models.constants');

async function createEmbedding(text, { model = AI_MODELS.TEXT_EMBEDDING_3_SMALL } = {}) {
  if (!isOpenAiConfigured()) {
    throw new AppError('OpenAI embeddings not configured', {
      status: 503,
      code: aiErrorCodes.AI_DISABLED,
    });
  }

  const client = getOpenAiClient();
  const started = Date.now();
  const input = Array.isArray(text) ? text : [String(text || '')];

  const response = await client.embeddings.create({
    model,
    input,
  });

  const usage = response.usage || {};

  return {
    embeddings: (response.data || []).map((row) => row.embedding),
    model: response.model || model,
    inputTokens: usage.prompt_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    latencyMs: Date.now() - started,
  };
}

module.exports = {
  createEmbedding,
};
