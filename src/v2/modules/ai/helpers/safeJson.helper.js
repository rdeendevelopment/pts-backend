/**
 * Parse model output as JSON with fenced-code-block stripping.
 */
function stripCodeFences(text) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function safeParseJson(text, fallback = null) {
  if (text == null) return fallback;
  if (typeof text === 'object') return text;

  const cleaned = stripCodeFences(String(text));

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    return fallback;
  }
}

module.exports = {
  stripCodeFences,
  safeParseJson,
};
