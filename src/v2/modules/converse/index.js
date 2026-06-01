const routes = require('./converse.routes');
const {
  ensureConversationIndexes,
  ensureConversationParticipantIndexes,
  ensureMessageIndexes,
} = require('./models');

async function ensureConverseModuleIndexes() {
  await ensureConversationIndexes();
  await ensureConversationParticipantIndexes();
  await ensureMessageIndexes();
}

module.exports = {
  routes,
  ensureConverseModuleIndexes,
  assertConversationParticipant: require('./services/converse.service').assertConversationParticipant,
  handleTyping: require('./services/converse.service').handleTyping,
};
