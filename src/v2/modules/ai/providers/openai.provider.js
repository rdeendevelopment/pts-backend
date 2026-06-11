const aiEnv = require('../config/ai.env');
const { AppError } = require('../../../kernel/errors');
const aiErrorCodes = require('../errors/aiErrorCodes');
const { withRetry } = require('../helpers/retry.helper');

let openaiClient = null;

function isOpenAiConfigured() {
  return Boolean(aiEnv.openai.apiKey);
}

function getOpenAiClient() {
  if (!isOpenAiConfigured()) {
    throw new AppError('OpenAI is not configured', {
      status: 503,
      code: aiErrorCodes.AI_DISABLED,
      details: { hint: 'Set OPENAI_API_KEY or PTS_OPENAI_API_KEY' },
    });
  }

  if (openaiClient) return openaiClient;

  try {
    // Optional dependency — only loaded when configured.
    const OpenAI = require('openai');
    openaiClient = new OpenAI({
      apiKey: aiEnv.openai.apiKey,
      organization: aiEnv.openai.organization || undefined,
      baseURL: aiEnv.openai.baseUrl,
    });
    return openaiClient;
  } catch (err) {
    throw new AppError('OpenAI SDK is not available', {
      status: 503,
      code: aiErrorCodes.AI_PROVIDER_ERROR,
      details: { message: err.message, hint: 'npm install openai' },
    });
  }
}

async function chatCompletion({
  model,
  messages,
  temperature = 0.3,
  maxTokens,
  responseFormat,
  timeoutMs = 15000,
}) {
  const client = getOpenAiClient();
  const started = Date.now();

  const response = await withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens || aiEnv.openai.defaultMaxOutputTokens,
        response_format: responseFormat || undefined,
      }, { signal: controller.signal });

      return result;
    } finally {
      clearTimeout(timer);
    }
  }, { label: 'openai-chat' });

  const choice = response.choices?.[0];
  const usage = response.usage || {};

  return {
    content: choice?.message?.content || '',
    model: response.model || model,
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    latencyMs: Date.now() - started,
    raw: response,
  };
}

module.exports = {
  isOpenAiConfigured,
  getOpenAiClient,
  chatCompletion,
};
