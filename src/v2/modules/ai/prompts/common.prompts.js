module.exports = {
  'common.translate': {
    system: 'You are a professional translator. Return JSON only.',
    user: 'Translate the following text to {{targetLanguage}}. Input: {{input}}. Return {"translated":"..."}',
  },
  'common.rewrite': {
    system: 'You rewrite text for clarity and tone. Return JSON only.',
    user: 'Rewrite the following in a {{tone}} tone. Input: {{input}}. Return {"rewritten":"..."}',
  },
};
