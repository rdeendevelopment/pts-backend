/** Supported OpenAI models — central registry for model selection. */
const AI_MODELS = {
  GPT_4O_MINI: 'gpt-4o-mini',
  GPT_4O: 'gpt-4o',
  GPT_4_TURBO: 'gpt-4-turbo',
  TEXT_EMBEDDING_3_SMALL: 'text-embedding-3-small',
};

/** Approximate cost per 1K tokens (USD) for internal accounting — not billing. */
const MODEL_COST_PER_1K = {
  [AI_MODELS.GPT_4O_MINI]: { input: 0.00015, output: 0.0006 },
  [AI_MODELS.GPT_4O]: { input: 0.0025, output: 0.01 },
  [AI_MODELS.GPT_4_TURBO]: { input: 0.01, output: 0.03 },
  [AI_MODELS.TEXT_EMBEDDING_3_SMALL]: { input: 0.00002, output: 0 },
};

const DEFAULT_MODEL = AI_MODELS.GPT_4O_MINI;

module.exports = {
  AI_MODELS,
  MODEL_COST_PER_1K,
  DEFAULT_MODEL,
};
