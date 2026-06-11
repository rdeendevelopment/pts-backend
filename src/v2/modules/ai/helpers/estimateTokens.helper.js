/**
 * Rough token estimation (chars/4 heuristic).
 * Used for pre-flight balance checks — not billing-grade.
 */
function estimateTokensFromText(text) {
  if (!text) return 0;
  const normalized = typeof text === 'string' ? text : JSON.stringify(text);
  return Math.ceil(normalized.length / 4);
}

function estimateTokensFromPayload(payload = {}) {
  const parts = [
    payload.input,
    payload.context,
    payload.systemPrompt,
    payload.userPrompt,
    payload.messages,
  ].filter(Boolean);

  return parts.reduce((sum, part) => sum + estimateTokensFromText(part), 0);
}

function estimateTotalTokens({ inputTokens = 0, maxOutputTokens = 1024 } = {}) {
  return inputTokens + maxOutputTokens;
}

module.exports = {
  estimateTokensFromText,
  estimateTokensFromPayload,
  estimateTotalTokens,
};
