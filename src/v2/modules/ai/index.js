const routes = require('./ai.routes');
const { ensureAiModuleIndexes } = require('./models');
const aiDispatcher = require('./services/ai-dispatcher.service');
const aiWorker = require('./services/ai-worker.service');

function bootstrapAiModule() {
  aiWorker.startWorker();
}

module.exports = {
  routes,
  ensureAiModuleIndexes,
  bootstrapAiModule,
  /** Public API for feature modules — never call OpenAI directly. */
  aiDispatcher,
};
