const MAX_INPUT_CHARS = 200_000;

function sanitizeText(value, { maxLength = 50_000 } = {}) {
  if (value == null) return '';
  const text = String(value)
    .replace(/\u0000/g, '')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function sanitizeObject(obj, depth = 0) {
  if (obj == null || depth > 6) return obj;
  if (typeof obj === 'string') return sanitizeText(obj);
  if (Array.isArray(obj)) return obj.map((item) => sanitizeObject(item, depth + 1));
  if (typeof obj !== 'object') return obj;

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = sanitizeObject(value, depth + 1);
  }
  return out;
}

function sanitizePromptPayload(input = {}, context = {}) {
  const serialized = JSON.stringify({ input, context });
  if (serialized.length > MAX_INPUT_CHARS) {
    return {
      input: sanitizeObject(input),
      context: { _truncated: true, preview: serialized.slice(0, MAX_INPUT_CHARS) },
    };
  }
  return {
    input: sanitizeObject(input),
    context: sanitizeObject(context),
  };
}

module.exports = {
  sanitizeText,
  sanitizeObject,
  sanitizePromptPayload,
  MAX_INPUT_CHARS,
};
