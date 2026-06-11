const { PROMPT_REGISTRY } = require('../prompts');
const { sanitizePromptPayload } = require('../helpers/promptSanitizer.helper');

function interpolate(template, vars = {}) {
  if (!template) return '';
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = vars[key];
    if (value == null) return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

function buildPrompt({ promptKey, input = {}, context = {} }) {
  const template = PROMPT_REGISTRY[promptKey];
  if (!template) {
    return {
      systemPrompt: 'You are a helpful assistant. Return JSON only.',
      userPrompt: JSON.stringify({ input, context }),
      promptKey,
    };
  }

  const { input: safeInput, context: safeContext } = sanitizePromptPayload(input, context);
  const vars = {
    input: typeof safeInput === 'string' ? safeInput : JSON.stringify(safeInput),
    context: JSON.stringify(safeContext),
    targetLanguage: safeInput?.targetLanguage || safeContext?.targetLanguage || 'English',
    tone: safeInput?.tone || safeContext?.tone || 'professional',
  };

  return {
    systemPrompt: template.system,
    userPrompt: interpolate(template.user, vars),
    promptKey,
  };
}

function toChatMessages({ systemPrompt, userPrompt }) {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

module.exports = {
  buildPrompt,
  toChatMessages,
  interpolate,
};
